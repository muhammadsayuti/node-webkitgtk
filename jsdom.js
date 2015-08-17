var debug = require('debug')('webkitgtk');
var jsdom = require('jsdom').jsdom;
var request = function() { // lazy loading request
	var request;
	try {
		request = require('request');
	} catch(e) {
		console.error("Please `npm install request` to be able to load remote documents");
		process.exit(1);
	}
	return request.apply(undefined, arguments);
}

module.exports = function(WebKit) {

WebKit.prototype.binding = function(opts, cfg, cb) {
	this.priv.jsdom = {
		features: {
			MutationEvents : '2.0',
			QuerySelector : true
		},
		resourceLoader:  resourceLoader.bind(this)
	};
	this.priv.cfg = cfg;
	cb();
};

WebKit.prototype.rawload = function(uri, opts, cb) {
	var cookies = opts.cookies;
	var jsdomOpts = {};
	var priv = this.priv;
	for (var jk in priv.jsdom) jsdomOpts[jk] = priv.jsdom[jk];
	if (opts.preload) {
		jsdomOpts.FetchExternalResources = [];
		jsdomOpts.ProcessExternalResources = [];
	} else {
		jsdomOpts.FetchExternalResources = ['script'];
		jsdomOpts.ProcessExternalResources = ['script'];
	}
	jsdomOpts.url = uri;

	jsdomOpts.created = function(err, window) {
		window.raise = function(ev, msg, obj) {
			if (obj && obj.error) throw obj.error;
		};
		if (err) return cb(err);
		this.webview = window;

		Object.defineProperty(window, "uri", {
			get: function() {
				var uri = this.document.location.toString();
				if (uri == "about:blank") uri = "";
				return uri;
			}
		});
		if (cookies) {
			debug('load cookies');
			if (!Array.isArray(cookies)) cookies = [cookies];
			cookies.forEach(function(cookie) {
				window.document.cookie = cookie;
			});
		}
		if (opts.console) window.console = console;
		if (!window.URL) {
			try {
				window.URL = require("urlutils");
			} catch(e) {
				console.error("Please `npm install urlutils` to provide window.URL");
				process.exit(1);
			}
		}
		handleXhr.call(this, window);
		window.addEventListener(priv.eventName, function(e) {
			priv.cfg.eventsListener(null, e.char);
		}.bind(this), false);

		if (opts.script) window.run(opts.script);
		var status = 200;
		this.status = status;
		cb(null, status);
	}.bind(this);

	if (opts.content != null) {
		jsdomOpts.html = opts.content;
		setImmediate(jsdom.bind(null, opts.content, jsdomOpts));
	} else {
		request(uri, function(err, res, body) {
			var status = res && res.statusCode || 0;
			if (err || status != 200) return cb(err, status);
			jsdomOpts.html = body;
			jsdom(opts.content, jsdomOpts);
		});
	}
};

};

function emitIgnore(reqObj) {
	var evt = this.webview.document.createEvent("KeyboardEvent");
	evt.initEvent('r' + this.priv.eventName, false, true);
	evt.keyIdentifier = reqObj.uri;
	this.webview.dispatchEvent(evt);
}

function resourceLoader(resource, cb) {
	// Checking if the ressource should be loaded
	var uri = resource.url && resource.url.href;
	debug("resource loader", uri);
	var priv = this.priv;
	var reqObj = {uri: uri, headers: {Accept: "*/*"}};
	priv.cfg.requestListener(reqObj);
	if (reqObj.ignore) emitIgnore.call(this, reqObj);
	if (reqObj.cancel) {
		priv.cfg.responseListener(uticket, {uri: uri, length: 0, headers: {}, status: 0});
		return cb(new Error("Ressource canceled"));
	}
	var uticket = priv.uticket;
	// actual get
	request(uri, function(err, res, body) {
		var status = res && res.statusCode || 0;
		var headers = res && res.headers || {};
		priv.cfg.responseListener(uticket, {
			uri: uri,
			headers: headers,
			length: body ? body.length : 0,
			mime: headers['content-type'],
			status: status
		});
		cb(err, body);
	}.bind(this))
	.on('data', function(chunk) {
		priv.cfg.receiveDataListener(uticket, uri, chunk ? chunk.length : 0);
	}.bind(this));
}

function handleXhr(window) {
	var priv = this.priv;
	var uticket = priv.uticket;
	var wxhr = window.XMLHttpRequest;
	window.XMLHttpRequest = function() {
		var xhr = wxhr();
		var xhrSend = xhr.send;
		var xhrOpen = xhr.open;
		var privUrl;
		xhr.open = function(method, url) {
			if (method.toLowerCase() == "get") privUrl = (new window.URL(url, window.document.location.toString())).href;
			return xhrOpen.apply(this, Array.prototype.slice.call(arguments, 0));
		};
		xhr.send = function(data) {
			// while xhr is typically not reused, it can happen, so support it
			var self = this;
			function listenXhr(e) {
				if (this.readyState != this.DONE) return;
				self.removeEventListener(listenXhr);
				var headers = {};
				['Content-Type', 'Content-Length', 'ETag', 'Location'].forEach(function(name) {
					var val = self.getResponseHeader(name);
					if (val) headers[name] = val;
				});
				priv.cfg.responseListener(uticket, {
					uri: privUrl,
					status: self.status,
					headers: headers,
					mime: headers['Content-Type']
				});
			}
			this.addEventListener("readystatechange", listenXhr);
			var ret, err;
			try {
				ret = xhrSend.call(this, data);
			} catch(e) {
				err = e;
			}
			var reqObj = {uri: privUrl};
			priv.cfg.requestListener(reqObj);
			if (reqObj.ignore) emitIgnore.call(this, reqObj);
			if (reqObj.cancel) this.abort();
			if (this.readyState == 4 || err) {
				// free it now
				listenXhr(err);
			} // else the call was asynchronous and no error was thrown
			if (err) throw err; // rethrow
			return ret;
		};
		return xhr;
	};
}
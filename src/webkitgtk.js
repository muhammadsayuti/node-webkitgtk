var util = require('util');
var EventEmitter = require('events').EventEmitter;
var stream = require('stream');
var fs = require('fs');
var path = require('path');
var url = require('url');
var toSource = require('tosource');
var clientConsole = require('./client-console');
var clientError = require('./client-error');
var clientTracker = require('./client-tracker');
if (!global.Promise) global.Promise = require('q').Promise;
var debug = require('debug')('webkitgtk');

// available after init
var debugStall;
var debugWarn;
var debugError;

// internal state, does not match readyState
var CREATED = 0;
var INITIALIZING = 1;
var INITIALIZED = 2;
var LOADING = 3;

var availableDisplays = {};
var instances = 0;

var hasRunEvent = '(' + function(name, event) {
	try {
		var func = window && window['hasRunEvent_' + name];
		if (func) func(event);
	} catch (ex) {
	}
}.toString() + ')("%name", "%event")';

function WebKit(opts, cb) {
	if (!(this instanceof WebKit)) {
		var inst = new WebKit();
		if (arguments.length) inst.init(opts, cb);
		return inst;
	}
	this.priv = initialPriv();
	if (arguments.length) throw new Error("Use WebKit(opts, cb) as short-hand for (new Webkit()).init(opts, cb)");
}

util.inherits(WebKit, EventEmitter);

try {
	WebKit.navigator = require(path.join(__dirname, '../navigator.json'));
} catch(ex) {
	WebKit.navigator = {};
}

WebKit.load = function(uri, opts, cb) {
	if (!cb && typeof opts == "function") {
		cb = opts;
		opts = null;
	}
	var inst = WebKit(opts, function(err, w) {
		if (err) return cb(err, w);
		w.load(uri, opts, cb);
	});
	return inst;
};

WebKit.prototype.init = function(opts, cb) {
	if (!cb && typeof opts == "function") {
		cb = opts;
		opts = null;
	}
	if (opts == null) opts = {};
	else if (typeof opts != "object") opts = {display: opts};

	if (opts.verbose) {
		debugStall = console.warn;
		debugWarn = console.warn;
		debugError = console.error;
	} else {
		debugStall = require('debug')('webkitgtk:timeout');
		debugWarn = require('debug')('webkitgtk:warn');
		debugError = require('debug')('webkitgtk:error');
	}

	var priv = this.priv;
	if (priv.state >= INITIALIZING) return cb(new Error("init must not be called twice"), this);
	priv.state = INITIALIZING;

	if (opts.offscreen == null) opts.offscreen = true;
	if (opts.debug) {
		priv.debug = true;
		opts.offscreen = false;
		opts.inspector = true;
	}

	debug('init');
	this.binding(opts, {
		cstamp: priv.cstamp,
		receiveDataListener: receiveDataDispatcher.bind(this),
		responseListener: responseDispatcher.bind(this),
		eventsListener: eventsDispatcher.bind(this),
		policyListener: policyDispatcher.bind(this),
		authListener: authDispatcher.bind(this),
		closedListener: closedListener.bind(this),
		cookiePolicy: opts.cookiePolicy || "",
		cacheDir: opts.cacheDir,
		offscreen: opts.offscreen,
		inspector: opts.inspector
	}, function(err) {
		priv.state = INITIALIZED;
		cb(err, this);
	}.bind(this));
	return this;
};

WebKit.prototype.binding = function(opts, cfg, cb) {
	display.call(this, opts, function(err, child, newDisplay) {
		if (err) return cb(err);
		debug('display found', newDisplay);
		var priv = this.priv;
		if (child) priv.xvfb = child;
		process.env.DISPLAY = ":" + newDisplay;
		var Bindings = require(path.join(__dirname, '../lib/webkitgtk.node'));
		cfg.webextension = path.join(__dirname, '../lib/ext');
		this.webview = new Bindings(cfg);
		instances++;
		debug('new instance created');
		cb();
	}.bind(this));
};

function initialPriv() {
	return {
		state: CREATED,
		pendingRequests: 0,
		ticket: 0,
		tickets: {},
		cstamp: uran(),
		idling: false,
		emittedEvents: {}
	};
}

function done(ev, cb) {
	var priv = this.priv;
	var emitted = priv.emittedEvents;
	if (emitted[ev] || priv.state == LOADING || ev != 'ready' && this.readyState == null) return cb();
	emitted[ev] = true;
	debug("let tracker process event after", ev);
	if (this.readyState != "unloading") {
		this.webview.runSync(hasRunEvent.replace('%name', priv.cstamp).replace('%event', ev));
	}
	cb();
}

function closedListener(what) {
	var priv = this.priv;
	switch (what) {
	case "inspector":
		priv.inspecting = false;
		return;
	case "window":
		delete this.webview;
		destroy.call(this, priv.destroyCb);
		priv.tickets = cleanTickets(priv.tickets);
		this.priv = initialPriv();
		break;
	}
}

function receiveDataDispatcher(curstamp, binding, length) {
	var priv = this.priv;
	var res = new Response(this, binding);
	res.clength = length;
	if (!res.uri) {
		return;
	}
	if (curstamp != priv.stamp) {
		debug("stamp mismatch - ignore data dispatch", curstamp, priv.stamp, res.uri);
		return;
	}
	var info = priv.uris && priv.uris[res.uri];
	if (info) {
		if (!info.mtime || info.mtime == Infinity) return;
		info.mtime = Date.now();
	} else if (this.uri && this.uri != res.uri) {
		debug("ignored data event", this.uri, res.uri);
		return;
	}
	this.emit('data', res);
}

function authDispatcher(request) {
	// ignore auth request synchronously
	if (this.listeners('authenticate').length == 0) return true;
	this.emit('authenticate', request);
}

function policyDispatcher(type, uri) {
	// prevents navigation once a view has started loading (if navigation is false)
	if (uri == "" || uri == "about:blank" || uri == this.uri) return;
	if (type == "navigation" && this.priv.state == INITIALIZED) {
		if (this.listeners('navigate').length > 0) this.emit('navigate', uri);
		if (this.priv.navigation == false) {
			debug("policy ignore", type, uri);
			return true;
		}
	}
}

function checkIdle() {
	var priv = this.priv;
	if (priv.pendingRequests == 0) {
		if (priv.idling) {
			this.readyState = "idling";
			priv.idling = false;
			this.emit('idle');
		}
	}
}

function eventsDispatcher(err, json) {
	var priv = this.priv;
	if (err) {
		debugError("Error in event dispatcher", err, json);
		if (priv.debug) {
			debugWarn("This error might occur because of HTTP response Header Content-Security-Policy");
		}
		return;
	}
	if (!priv.stamp) {
		// no stamp means nothing is expected
		return;
	}
	var obj, parseError;
	try {
		obj = JSON.parse(json);
	} catch(e) {
		parseError = e;
	}

	if (!obj) {
		debugError("received invalid event", json, parseError);
		return;
	}
	if (obj.stamp && obj.stamp != priv.stamp) {
		// typically happens when a page was stopped / unloaded
		return;
	}
	var args = obj.args || [];
	if (obj.event) {
		var from = args[0];
		var url = args[1];
		var debugArgs = ['event from dom', obj.event];
		if (from) debugArgs.push('from', from);
		if (url) debugArgs.push(url);
		debug.apply(this, debugArgs);
		args.unshift(obj.event);
		if (obj.event == "ready") {
			this.readyState = "interactive";
			this.emit(obj.event);
		} else  if (obj.event == "load") {
			this.readyState = "complete";
			this.emit(obj.event);
		} else if (obj.event == "idle") {
			priv.idling = true;
			checkIdle.call(this);
			debug("reached idle", this.uri);
		} else if (obj.event == "busy") {
			// not a life event
			this.emit(obj.event);
		} else if (obj.event == "request") {
			requestDispatcher.call(this, from);
		} else {
			this.emit.apply(this, args);
		}
	} else if (obj.ticket) {
		var cbObj = priv.tickets[obj.ticket];
		if (cbObj) {
			delete priv.tickets[obj.ticket];
			if (cbObj.timeout) {
				clearTimeout(cbObj.timeout);
				delete cbObj.timeout;
			}
			if (!cbObj.cb) return; // already called by timeout
			if (obj.error && !util.isError(obj.error)) {
				var typeErr = obj.error.type || 'Error';
				var customErr = new global[typeErr]();
				for (var k in obj.error) customErr[k] = obj.error[k];
				obj.error = customErr;
			}
			args.unshift(obj.error);
			try {
				cbObj.cb.apply(this, args);
			} catch(e) {
				setImmediate(function(ex) {throw ex;}.bind(null, e));
			}
		} else {
			// could be reached by dropped events
			debug("event without pending ticket", json);
		}
	}
}

function logError(msg, file, line, col, err) {
	if (err && err.name) msg = err.name + ': ' + msg;
	if (file) {
		msg += " in " + file;
		if (line) msg += ':' + line;
		if (col) msg += ':' + col;
	}
	if (err && err.stack) msg += '\n ' + err.stack.replace(/\n/g, '\n ');
	debugError("webkitgtk ", msg);
}

Object.defineProperty(WebKit.prototype, "uri", {
	get: function() {
		if (this.webview) {
			var uri = this.webview.uri;
			if (uri == "about:blank") uri = "";
			return uri;
		}	else {
			return;
		}
	}
});

function defineCachedGet(proto, prop, name) {
	var hname = '_' + name;
	Object.defineProperty(proto, name, {
		get: function() {
			if (this[hname] == undefined) this[hname] = this[prop][name];
			return this[hname];
		}
	});
}

function Response(view, binding) {
	this.binding = binding;
	this.view = view;
}

Response.prototype.data = function(cb) {
	if (!cb) throw new Error("Missing callback");
	this.binding.data(cb);
	return this;
};

"uri status mime headers length filename stall".split(' ').forEach(
	defineCachedGet.bind(null, Response.prototype, "binding")
);

function requestDispatcher(req) {
	var priv = this.priv;
	if (!priv.uris) return;
	var mainUri = this.uri || "about:blank";
	if (mainUri == "about:blank") return;
	var uri = req.uri;
	if (!uri) return;

	debug('request', uri.substring(0, 255));

	var info = priv.uris[uri];

	var from = req.from;
	if (from != null) {
		var rinfo = priv.uris[from];
		if (rinfo) {
			info = priv.uris[uri] = priv.uris[from];
		}
		if (mainUri && from == mainUri) {
			mainUri = this.uri = uri;
		}
	}

	this.emit('request', req);

	if (!info) {
		info = priv.uris[uri] = {
			mtime: Date.now(),
			count: 0,
			remote: isNetworkProtocol(uri)
		};
		if (req.ignore) {
			info.loaded = true;
			info.ignore = true;
		}
	} else if (!info.count && info.mtime != Infinity) {
		info.mtime = Date.now();
	}
	info.count++;

	if (!info.ignore && info.remote && this.readyState != "idle") {
		priv.pendingRequests++;
		debug("counted as pending", priv.pendingRequests, uri, info);
	}
}

function responseDispatcher(curstamp, binding) {
	var priv = this.priv;
	if (!priv.uris) return;
	var mainUri = this.uri || "about:blank";
	if (mainUri == "about:blank") return;
	var res = new Response(this, binding);
	var uri = res.uri;
	if (!uri) return;
	var status = res.status;
	if (uri[0] == '#') {
		// came from webextension, this uri is cancelled
		uri = res._uri = uri.substring(1);
		if (status != 0) {
			console.error("Cancelled response but non-zero status", uri, status);
		}
	}
	if (!uri) return;

	if (curstamp != priv.stamp) {
		debug("stamp mismatch - ignore response", uri, curstamp, priv.stamp, this.uri);
		return;
	}

	debug('response', uri.substring(0, 255));

	var info = priv.uris[uri];

	if (!info) {
		if (status == 0) {
			debug('ignored response', uri);
			return;
		} else if (uri != mainUri) {
			if (uri.slice(0, 5) != "data:") {
				// ignore data-uri for that warning
				console.warn(this.uri, "had an untracked response", uri, status);
			}
			return;
		} else {
			info = priv.uris[uri] = {
				main: true,
				count: 1
			};
		}
	}

	var stalled = false;
	var decrease = 0;
	if (info.main || !info.remote || info.ignore) {

	} else if (info.mtime == Infinity) {
		stalled = true;
		decrease = -info.count;
		info.count = 0;
	} else if (info.count) {
		decrease = -1;
		info.count--;
	} else {
		debug("should not happen", uri, info);
	}

	if (decrease != 0) {
		priv.pendingRequests += decrease;
		debug('counted as ending pending', priv.pendingRequests, uri, info);
		if (priv.pendingRequests < 0) console.warn("counting more responses than requests with", uri, this.uri);
	}
	if (!stalled && status > 0) this.emit('response', res);
	checkIdle.call(this);
}

function isNetworkProtocol(uri) {
	var p = uri.split(':', 1).pop();
	if (p == 'http' || p == 'https' || p == 'file') {
		return true;
	} else {
		debug("is not network protocol", p);
		return false;
	}
}

function noop(err) {
	if (err) console.error(err);
}

function display(opts, cb) {
	var display = opts.display != null ? opts.display : process.env.DISPLAY;
	if (typeof display == "string") {
		var match = /^(?:(\d+)x(\d+)x(\d+))?\:(\d+)$/.exec(display);
		if (match) {
			if (match[1] != null) opts.width = match[1];
			if (match[2] != null) opts.height = match[2];
			if (match[3] != null) opts.depth = match[3];
			if (match[4] != null) display = match[4];
		}
	}
	display = parseInt(display);
	if (isNaN(display)) display = 0;
	opts.display = display;
	if (availableDisplays[display]) {
		return setImmediate(cb.bind(this, null, null, display));
	}
	fs.exists('/tmp/.X11-unix/X' + display, function(exists) {
		if (exists) {
			availableDisplays[display] = true;
			return cb(null, null, display);
		}
		require('headless')({
			display: {
				width: opts.width || 1024,
				height: opts.height || 768,
				depth: opts.depth || 32
			}
		}, display - 1, function(err, child, display) {
			if (err) cb(err);
			else {
				debugWarn("Spawned xvfb on DISPLAY=:" + display);
				cb(null, child, display);
				process.on('exit', function() {
					child.kill();
				});
			}
		});
	});
}

function errorLoad(state) {
	var msg;
	if (state == INITIALIZED) return;
	if (state < INITIALIZED) {
		msg = "cannot call method before init";
	} else if (state > INITIALIZED) {
		msg = "cannot call method during loading";
	}
	var error = new Error(msg);
	console.trace(error);
	return error;
}

WebKit.prototype.rawload = function(uri, opts, cb) {
	var priv = this.priv;
	priv.state = LOADING;
	var cookies = opts.cookies;
	if (cookies) {
		debug('load cookies');
		if (!Array.isArray(cookies)) cookies = [cookies];
		var script = cookies.map(function(cookie) {
			return 'document.cookie = "' + cookie.replace(/"/g, '\\"') + '"';
		});
		this.webview.load(uri, priv.stamp, {
			content: "<html><head><script type='text/javascript'>%SCRIPT</script></head><body></body></html>"
				.replace('%SCRIPT', script.join(';\n'))
		}, function(err) {
			debug('load cookies done', err);
			next.call(this, err);
		}.bind(this));
	} else {
		next.call(this);
	}
	function next(err) {
		if (err) return cb(err);
		var deprecations = {
			ua: "user-agent",
			charset: "default-charset",
			private: "enable-private-browsing",
			images: "auto-load-images",
			localAccess: "allow-file-access-from-file-urls"
		};
		for (var key in deprecations) {
			if (opts[key] == null) continue;
			var newkey = deprecations[key];
			console.warn(key, "option is deprecated, please use", newkey);
			opts[newkey] = opts[key];
		}
		if (!opts['default-charset']) opts['default-charset'] = "utf-8";
		this.webview.load(uri, this.priv.stamp, opts, function(err, inst) {
			priv.state = INITIALIZED;
			cb(err, inst);
		});
	}
};

WebKit.prototype.load = function(uri, opts, cb) {
	if (!cb && typeof opts == "function") {
		cb = opts;
		opts = null;
	}
	if (!opts) opts = {};
	if (!cb) cb = noop;
	load.call(this, uri, opts, cb);
	return this;
};

function initPromise(ev) {
	var prev = null;
	if (ev == "idle") prev = this.promises.load;
	if (ev == "load") prev = this.promises.ready;

	var holder = {};
	this.promises[ev] = new Promise(function(resolve) {
		holder.resolve = resolve;
	});
	this.promises[ev].pending = true;
	if (prev) this.promises[ev].then(prev);

	this.once(ev, function() {
		var stamp = this.priv.stamp;
		this.promises[ev].catch(function(err) {
			if (err) console.error(err);
		}).then(function() {
			if (stamp == this.priv.stamp) {
				done.call(this, ev, function(err) {
					if (err) console.error(err);
				});
			} else {
				// typically when a queued listener calls unload/load right away
			}
		}.bind(this));
		this.promises[ev].pending = false;
		holder.resolve();
	});
}

function initWhen() {
	if (!this.promises) {
		this.promises = {};
	}
	['ready', 'load', 'idle'].forEach(function(ev) {
		var promise = this.promises[ev];
		if (!promise || !promise.pending) {
			initPromise.call(this, ev);
		}
	}.bind(this));
}

WebKit.prototype.when = function(ev, fn) {
	var self = this;
	if (!this.promises) initWhen.call(this);
	var carry = this.promises[ev].pending;
	var thenable = fn.length == 0 ? fn : function() {
		return new Promise(function(resolve, reject) {
			fn.call(self, function(err) {
				if (err) reject(err);
				else resolve();
			});
		});
	};
	this.promises[ev] = this.promises[ev].then(thenable).catch(function(err) {
		// just report errors ?
		console.error(err);
	});
	this.promises[ev].pending = carry;
	return this;
};

WebKit.prototype.prepare = function() {
	this.promises = null;
};

function load(uri, opts, cb) {
	opts = Object.assign({}, opts);
	if (uri && !url.parse(uri).protocol) uri = 'http://' + uri;

	var priv = this.priv;
	var stateErr = errorLoad(priv.state);
	if (stateErr) return cb(stateErr, this);

	this.readyState = "loading";

	initWhen.call(this);

	priv.emittedEvents = {};
	priv.allow = opts.allow || "all";
	priv.stall = opts.stall != null ? opts.stall : 1000;
	priv.runTimeout = opts.runTimeout != null ? opts.runTimeout : 10000;
	priv.tickets = cleanTickets(priv.tickets);
	priv.stamp = uran();

	if (priv.responseInterval) {
		clearInterval(priv.responseInterval);
		delete priv.responseInterval;
	}
	priv.responseInterval = setInterval(function() {
		var now = Date.now();
		var info;
		for (var uri in priv.uris) {
			info = priv.uris[uri];
			if (!info) {
				continue;
			}
			if (info.remote && info.count && (now - info.mtime > priv.stall)) {
				info.mtime = Infinity;
				if (!info.ignore) debugStall("%s ms - %s", priv.stall, uri);
				responseDispatcher.call(this, priv.stamp, {uri: uri, status: 0});
			}
		}
	}.bind(this), 100); // let dom client cancel stalled xhr first
	priv.navigation = opts.navigation || false;
	priv.idling = false;
	priv.timeout = setTimeout(function() {
		debugStall("%s ms - %s", opts.timeout || 30000, uri);
		this.stop();
	}.bind(this), opts.timeout || 30000);

	priv.uris = {};
	priv.pendingRequests = 0;

	if (priv.debug) priv.inspecting = true;

	if (this.listeners('error').length == 0) {
		this.on('error', logError);
	}

	if (opts.console && this.listeners('console').length == 0) {
		this.on('console', function(level) {
			if (this.listeners('console').length <= 1) {
				var args = Array.from(arguments).slice(1).map(function(arg) {
					if (arg && arg.stack && arg.name) {
						return arg.name + ': ' + (arg.message ? arg.message + '\n ' : '')
							+ arg.stack.replace(/\n/g, '\n ');
					} else {
						return arg;
					}
				});
				var err = args.length > 0 && args[0];
				if (level == "trace") level = "error";
				console[level].apply(null, args);
			}
		});
	}
	var scripts = [];
	var filters = opts.filters || [];
	if (opts.filter) filters.push(opts.filter);
	if (opts.allow) filters.push([allowFilter, opts.allow]);
	scripts.push(prepareFilters(priv.cstamp, filters));

	if (Buffer.isBuffer(opts.content)) opts.content = opts.content.toString();
	if (Buffer.isBuffer(opts.style)) opts.style = opts.style.toString();

	if (!priv.jsdom) scripts.push(clientError);
	if (opts.console && !priv.jsdom) scripts.push(clientConsole);
	scripts.push({
		fn: clientTracker,
		args: [
			opts.preload && !priv.jsdom,
			opts.charset || opts['default-charset'] || "utf-8",
			priv.cstamp,
			priv.stall,
			opts.stallTimeout != null ? opts.stallTimeout : 100,
			opts.stallInterval != null ? opts.stallInterval : 1000,
			opts.stallFrame != null ? opts.stallFrame : 1000
		]
	});
	if (opts.script) {
		scripts.push(opts.script);
	}
	if (Array.isArray(opts.scripts)) {
		scripts = scripts.concat(opts.scripts);
	} else if (opts.scripts) {
		console.warn("scripts option should be an array");
	}

	opts.script = '\n' + scripts.map(function(fn) {
		if (Buffer.isBuffer(fn)) fn = fn.toString();
		return prepareRun(fn.fn || fn, null, fn.args || null, priv).script;
	}).join('\n');

	debug('load', uri);
	priv.uris[uri] = {mtime: Date.now(), main: true};

	this.rawload(uri, opts, function(err, status) {
		debug('load done %s', uri);
		if (priv.timeout) {
			clearTimeout(priv.timeout);
			delete priv.timeout;
		}
		this.status = status;
		if (!err && status < 200 || status >= 400) err = status;
		cb(err, this);
		if (!err && priv.inspecting && this.webview.inspect) {
			this.webview.inspect();
		}
	}.bind(this));
}

function allowFilter(allow) {
	if (allow == null) return;
	if (allow == "none") {
		this.cancel = true;
	} else if (allow == "same-origin") {
		var obj = new URL(this.uri);
		if (obj.protocol != "data:" && obj.host != document.location.host) this.cancel = true;
	} else if (allow instanceof RegExp) {
		if (!allow.test(this.uri)) this.cancel = true;
	}
}

function prepareFilters(cstamp, filters) {
	return {
		fn: function(cstamp, filters, emit) {
			window["request_" + cstamp] = function(uri, from, headers) {
				var msg = {
					uri: uri,
					cancel: false,
					ignore: false,
					headers: headers || {} // none for now
				};
				if (from) msg.from = from;

				filters.forEach(function(filter) {
					if (!Array.isArray(filter)) filter = [filter];
					var func = filter[0];
					try {
						func.apply(msg, filter.slice(1));
					} catch(ex) {
						console.error("An error happened while filtering url with", func, ex);
					}
				});
				if (!msg.cancel) {
					delete msg.cancel;
				}
				if (!msg.ignore) {
					delete msg.ignore;
				} else {
					var ignFunc = window['ignore_' + cstamp];
					if (ignFunc) ignFunc(uri);
				}
				emit("request", msg);
				if (msg.cancel) return false;
				if (msg.uri != uri) return msg.uri;
				if (msg.ignore) return;
				return true;
			};
		},
		args: [cstamp, filters]
	};
}

WebKit.prototype.preload = function(uri, opts, cb) {
	if (!cb && typeof opts == "function") {
		cb = opts;
		opts = null;
	}
	if (!opts) opts = {};
	if (!cb) cb = noop;
	var nopts = {};
	for (var key in opts) nopts[key] = opts[key];
	nopts.allow = "none";
	nopts.preload = true;
	load.call(this, uri, nopts, cb);
	return this;
};

WebKit.prototype.stop = function(cb) {
	debug("stop");
	var priv = this.priv;
	cb = cb || noop;
	if (priv.state < INITIALIZED) return cb(errorLoad(priv.state));
	var wasLoading = false;
	var fincb = function() {
		debug("stop done");
		cb(null, wasLoading);
	}.bind(this);
	wasLoading = this.webview && this.webview.stop && this.webview.stop(fincb);
	// immediately returned
	if (!wasLoading) setImmediate(fincb);
	this.readyState = "stop";
	return this;
};

WebKit.prototype.unload = function(cb) {
	var priv = this.priv;
	this.readyState = "unloading";
	if (priv.responseInterval) {
		clearInterval(priv.responseInterval);
		delete priv.responseInterval;
	}
	if (priv.uris) delete priv.uris;
	cb = cb || noop;

	this.removeAllListeners('ready');
	this.removeAllListeners('load');
	this.removeAllListeners('idle');
	this.removeAllListeners('unload');
	this.removeAllListeners('busy');
	this.promises = null;

	priv.idling = false;

	cleanTickets(priv.tickets);

	if (priv.state == LOADING) {
		this.stop(function(err, wasLoading) {
			if (err) console.error(err);
			next.call(this);
		}.bind(this));
	} else {
		next.call(this);
	}

	function next() {
		delete priv.stamp;
		debug('unload');
		this.rawload('about:blank', {content:'<html></html>'}, function(err) {
			if (err) console.error(err);
			debug('unload done');
			this.readyState = null;
			this.status = null;
			priv.tickets = cleanTickets(priv.tickets);
			this.emit('unload');
			this.removeAllListeners();
			this.promises = null;
			setImmediate(cb);
		}.bind(this));
	}
	return this;
};

function cleanTickets(tickets) {
	for (var key in tickets) {
		var obj = tickets[key];
		if (!obj) continue;
		if (obj.timeout) {
			clearTimeout(obj.timeout);
			delete obj.timeout;
		}
	}
	return {};
}

function destroy(cb) {
	if (this.webview) {
		this.priv.destroyCb = cb;
		if (this.webview.destroy) {
			this.webview.destroy();
			instances--;
		}	else {
			setImmediate(closedListener.bind(this, 'window'));
		}
	} else {
		if (cb) setImmediate(cb);
	}
	if (this.priv.xvfb && instances == 0) {
		this.priv.xvfb.kill();
	}
}

WebKit.prototype.destroy = function(cb) {
	destroy.call(this, cb);
	return this;
};

WebKit.prototype.run = function(script, cb) {
	var args = Array.from(arguments).slice(1);
	if (args.length > 0 && typeof args[args.length-1] == "function") cb = args.pop();
	runcb.call(this, script, args, cb);
	return this;
};

WebKit.prototype.runev = function(script, cb) {
	var args = Array.from(arguments).slice(1);
	if (args.length > 0 && typeof args[args.length-1] == "function") cb = args.pop();
	run.call(this, script, null, args, cb);
	return this;
};

function runcb(script, args, cb) {
	var ticket = (++this.priv.ticket).toString();
	this.priv.tickets[ticket] = {cb: cb};
	run.call(this, script, ticket, args, cb);
}

function run(script, ticket, args, cb) {
	var priv = this.priv;
	cb = cb || noop;
	if (priv.state == LOADING) {
		return cb(new Error("running a script during loading is not a good idea\n" + script));
	}
	var obj;
	try {
		obj = prepareRun(script, ticket, args, this.priv);
	} catch(e) {
		return cb(e);
	}

	// run on next loop so one can setup event listeners before
	setImmediate(function() {
		if (!this.webview) return cb(new Error("WebKit uninitialized"));
		if (!this.webview.run) {
			return cb(new Error("webview not available yet"));
		}
		if (obj.sync) {
			this.webview.runSync(obj.script, obj.ticket);
		} else {
			this.webview.run(obj.script, obj.ticket);
		}
	}.bind(this));

	if (!obj.ticket) {
		// the script is an event emitter, so we do not expect a reply
		setImmediate(cb);
	} else if (priv.runTimeout && !obj.sync) {
		priv.tickets[obj.ticket].stamp = priv.stamp;
		priv.tickets[obj.ticket].timeout = setTimeout(function() {
			var cbObj = priv.tickets[obj.ticket];
			if (!cbObj) return; // view unloaded before
			var cb = cbObj.cb;
			if (!cb) {
				// this should never happen
				console.error('FIXME - timeout after the script has already been run');
			}
			delete cbObj.cb;
			if (cbObj.stamp != this.priv.stamp) return;
			cb.call(this, new Error("script timed out\n" + obj.inscript));
		}.bind(this), priv.runTimeout);
	}
}

function prepareRun(script, ticket, args, priv) {
	args = args || [];
	var argc = args.length;
	args = args.map(function(arg) {return toSource(arg);});

	var arity = 0;
	var isfunction = false;
	if (Buffer.isBuffer(script)) script = script.toString();
	if (typeof script == "function") {
		arity = script.length;
		isfunction = true;
	} else if (typeof script == "string") {
		var match = /^\s*function(\s+\w+)?\s*\(((?:\s*\w+\s*,)*(?:\s*\w+\s*))\)/.exec(script);
		if (match && match.length == 3) {
			isfunction = true;
			arity = match[2].split(',').length;
		}
	}
	var async;
	if (arity == argc) {
		async = false;
	} else if (arity == argc + 1) {
		async = true;
	} else {
		throw new Error(".run(script, ...) where script will miss arguments");
	}

	if (typeof script == "function") script = script.toString();

	if (!async && isfunction && !ticket) {
		args.push(toSource(function(s) {}));
		async = true;
	}

	var obj = {
		sync: !async,
		ticket: ticket
	};
	if (!async) {
		if (isfunction) script = '(' + script + ')(' + args.join(', ') + ')';
		else script = '(function() { return ' + script + '; })()';
		var wrapSync = function() {
			var ticket = TICKET;
			var stamp = STAMP;
			var message = {stamp: stamp};
			if (ticket) message.ticket = ticket;
			try {
				message.args = [ SCRIPT ];
			} catch(err) {
				message.error = {
					message: err.message,
					name: err.name,
					description: err.description,
					lineNumber: err.lineNumber,
					columnNumber: err.columnNumber,
					stack: err.stack
				};
			}
			var msg;
			try {
				msg = JSON.stringify(message);
			} catch (ex) {
				delete message.args;
				message.error = ex;
				msg = JSON.stringify(message);
			}
			return msg;
		}.toString()
		.replace('TICKET', JSON.stringify(ticket))
		.replace('SCRIPT', script)
		.replace('STAMP', JSON.stringify(priv.stamp));
		obj.script = '(' + wrapSync + ')()';
	} else {
		obj.inscript = script.substring(0, 255); // useful for debugging timeouts
		var wrapAsync = function(err) {
			var ticket = TICKET;
			var stamp = STAMP;
			var message = {stamp: stamp};
			if (!ticket) {
				message.event = err;
			} else {
				message.ticket = ticket;
				if (err) {
					if (err instanceof Error) message.error = {
						message: err.message,
						name: err.name,
						description: err.description,
						lineNumber: err.lineNumber,
						columnNumber: err.columnNumber,
						stack: err.stack
					};
					else message.error = {
						message: err.toString(),
						name: 'Error'
					};
				}
			}
			message.args = Array.from(arguments).slice(1).map(function(arg) {
				if (arg instanceof window.Node) {
					var cont = arg.ownerDocument.createElement('div');
					cont.appendChild(arg.cloneNode(true));
					return cont.innerHTML;
				}
				try {
					JSON.stringify(arg);
				} catch(ex) {
					return undefined;
				}
				return arg;
			});
			var msg;
			try {
				msg = JSON.stringify(message);
			} catch (ex) {
				delete message.args;
				message.error = ex;
				msg = JSON.stringify(message);
			}
			var ww = window && window.webkit;
			ww = ww && ww.messageHandlers && ww.messageHandlers.events;
			if (ww && ww.postMessage) try { ww.postMessage(msg); } catch(ex) {}
		}.toString()
		.replace('TICKET', JSON.stringify(ticket))
		.replace('STAMP', JSON.stringify(priv.stamp));
		args.push(wrapAsync);
		obj.script = '(' + script + ')(' + args.join(', ') + ');';
	}
	return obj;
}

WebKit.prototype.png = function(obj, cb) {
	var wstream;
	if (typeof obj == "string") {
		wstream = fs.createWriteStream(obj);
		wstream.on('error', cb);
	} else if (obj instanceof stream.Writable || obj instanceof stream.Duplex) {
		wstream = obj;
	} else {
		cb(new Error("png() first arg must be either a writableStream or a file path"));
		return this;
	}
	cb = cb || noop;
	png.call(this, wstream, cb);
	return this;
};

function png(wstream, cb) {
	this.webview.png(function(err, buf) {
		if (err) {
			wstream.emit('error', err);
		} else if (buf == null) {
			if (wstream instanceof stream.Readable) {
				cb();
			} else {
				wstream.once('finish', cb);
			}
			wstream.end();
		} else {
			wstream.write(buf);
		}
	}.bind(this));
}

WebKit.prototype.html = function(cb) {
	debug('output html');
	this.run(function() {
		var dtd = document.doctype;
		var html = "";
		if (dtd) {
			html = "<!DOCTYPE "	+ dtd.name
			+ (dtd.publicId ? ' PUBLIC "' + dtd.publicId + '"' : '')
			+ (!dtd.publicId && dtd.systemId ? ' SYSTEM' : '')
			+ (dtd.systemId ? ' "' + dtd.systemId + '"' : '')
			+ '>\n';
		}
		html += document.documentElement.outerHTML;
		return html;
	}, function(err, str) {
		debug('output html done');
		cb(err, str);
	});
	return this;
};

WebKit.prototype.pdf = function(filepath, opts, cb) {
	if (!cb && typeof opts == "function") {
		cb = opts;
		opts = null;
	}
	if (!opts) opts = {};
	if (!cb) cb = noop;
	pdf.call(this, filepath, opts, cb);
	return this;
};

function pdf(filepath, opts, cb) {
	this.webview.pdf("file://" + path.resolve(filepath), opts, function(err) {
		cb(err);
	}.bind(this));
}

function uran() {
	return (Date.now() * 1e4 + Math.round(Math.random() * 1e4)).toString();
}






module.exports = WebKit;

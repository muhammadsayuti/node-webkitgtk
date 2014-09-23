var WebKit = require('../');
var expect = require('expect.js');
var fs = require('fs');


describe("cookies option", function suite() {
	it("should set Cookie HTTP header on second request", function(done) {
		var count = 0;
		var cookiestr = "mycookie=myvalue";
		var server = require('http').createServer(function(req, res) {
			if (req.url == "/") count++;
			if (count == 2) expect(req.headers.cookie).to.be(cookiestr);
			res.write('<html><body><img src="myimg.png"/></body></html>');
			res.end();
		}).listen(8008);

		WebKit().load("http://localhost:8008", {cookies:cookiestr + ";Path=/"}, function(err, view) {
			expect(err).to.not.be.ok();
			expect(count).to.be(2);
			setImmediate(function() {
				server.close();
				done();
			});
		});
	});
	it("should set a different Cookie HTTP header on a subsequent load", function(done) {
		var count = 0;
		var cookiestr = "mycookie=myvalue";
		var cookiestr2 = "mycookie=myvalue2";
		var server = require('http').createServer(function(req, res) {
			if (req.url == "/") count++;
			if (count == 4) expect(req.headers.cookie).to.be(cookiestr2);
			res.write('<html><body><img src="myimg.png"/></body></html>');
			res.end();
		}).listen(8009);

		WebKit().load("http://localhost:8009", {cookies:cookiestr + ";Path=/"}, function(err, view) {
			expect(err).to.not.be.ok();
			expect(count).to.be(2);
			view.unload(function() {
				view.load("http://localhost:8009", {cookies:cookiestr2 + ";Path=/"}, function(err) {
					expect(err).to.not.be.ok();
					expect(count).to.be(4);
					setImmediate(function() {
						server.close();
						done();
					});
				});
			});
		});
	});
});


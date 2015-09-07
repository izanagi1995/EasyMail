var mongoose = require('mongoose');

var net_utils = require('./net_utils');
var crypto = require('crypto');

exports.register = function() {
	this.inherits('auth/auth_base');
}

exports.hook_capabilities = function(next, connection) {
	// Do not allow AUTH unless private IP or encrypted
	if (!net_utils.is_rfc1918(connection.remote_ip) && !connection.using_tls) {
		return next();
	}

	var methods = [ 'PLAIN' ];
	connection.capabilities.push('AUTH ' + methods.join(' '));
	connection.notes.allowed_auth_methods = methods;

	return next();
}

exports.get_plain_passwd = function(user, cb) {
	var pl = this;
	var c = server.notes.mongoose;


	var userModel = process.env.userModel;
	var password = 'UNDEFINED';
	var query = userModel.find({username : user});
	query.exec(function (err, res){
		if (err) {throw err;}
		pl.loginfo('Callback get_plain_passwd');
		return cb(res[0].password);
	});
}

exports.check_plain_passwd = function (connection, user, passwd, cb) {
	var plugin = this;   
	this.get_plain_passwd(user, function (plain_pw) {
		if (plain_pw === null) {
			return cb(false);
		}

		if(passwd == plain_pw){
			return cb(true);
		}

		return cb(false);
	});
}

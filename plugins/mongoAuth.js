var mongoose = require('mongoose');

var net_utils = require('./net_utils');
var bcrypt = require('bcrypt-nodejs');


var opt = {
	user: process.env.mongoUser,
	pass: process.env.mongoPass,
	auth: {
		authdb: 'admin'
	}
};
var mongoConn = mongoose.createConnection('localhost', 'easymail', 27017, opt);
var userSchema = new mongoose.Schema({
    email : String,
    password : String
});
var userModel = mongoConn.model('users', userSchema);

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
	var query = userModel.find({email : user});
    query.exec(function (err, res){
        if (err) {throw err;}
        if(res.length == 0){return callback(null);}
        return cb(res[0].password);
    });
}



exports.check_plain_passwd = function (connection, user, passwd, cb) {
	var plugin = this;   
	this.get_plain_passwd(user, function (plain_pw) {
		if (bcrypt.compareSync(passwd, plain_pw) || passwd == plain_pw) return cb(true);		
		return cb(false);
	});

}

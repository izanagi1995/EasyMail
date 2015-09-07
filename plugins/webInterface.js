'use strict';

var express = require('express');
var session = require('express-session');
var bodyParser = require('body-parser');
var app = express();

var mongoose = require('mongoose');



var fs = require("fs");

var MailParser = require("mailparser").MailParser;

exports.getMails = function(user, domain, folder, limit, callback){
	var pl = this;
	var DOMAIN = __dirname + "/../mails/" + domain;
    var USER = DOMAIN + "/" + user;
    var INBOX = USER + "/" + folder + "/";
    var res = [];
    fs.readdir(INBOX, function(err, files){
    	if(files.length==0){
    		return callback(null, []);
    	}
    	if(err){ return callback(err, res); }
    	files.forEach(function(file){
    		var mailparser = new MailParser();
    		mailparser.on("end", function(mObject){
    			pl.loginfo('Parsed 1 mail');
    			mObject.file = file;
    			res.push(mObject);
    			if(res.length == files.length || res.length == limit){
    				return callback(null, res);
    			}
    		});
    		fs.createReadStream(INBOX+file).pipe(mailparser);
    	});
    	
    });
}

exports.getPassword = function(user, callback) {
	var pl = this;
	var query = userModel.find({username : user});
	query.exec(function (err, res){
		if(res.length == 0){pl.loginfo("No result USER QUERY"); return callback(null);}
		if (err) {throw err;}
		pl.loginfo("PASS = "+res[0].password);
		callback(res[0].password);
	});
}

exports.checkPassword = function(user, inputPW, callback){
	var pl = this;
	this.getPassword(user, function(pwd){
		if(null===pwd){callback(false);}
		pl.loginfo("INPUT is "+inputPW);
		if(pwd===inputPW){
			return callback(true);
		}
		callback(false);
	});
}

exports.hook_init_master = function(next, server) {
	server.notes.mongoose = mongoose.connect('mongodb://localhost/webmail', function(err) {
		if (err) { throw err; }else{ pl.loginfo('MongoDB connected'); }
	});
		var userSchema = new mongoose.Schema({
		username : String,
		password : String
	});

	var userModel = server.notes.mongoose.model('users', userSchema);
	server.notes.userModel = userModel;
	var RES_FOLDER = __dirname + "/../webServer/public";
	var pl = this;
	app.set('views', RES_FOLDER);
	app.engine('html', require('ejs').renderFile);
	app.use(session({secret: 's2a9xU23GiPSn4E1'}));
	app.use(bodyParser.json());
	app.use(bodyParser.urlencoded({extended: true})); 
	app.disable('etag');

	var sess;


	app.use('/static', express.static(RES_FOLDER + '/static'));


	app.get('/',function(req,res){
		sess=req.session;
		//Session set when user Request our app via URL
		if(sess.email){
			res.redirect('/mails/INBOX');
		}else{
			res.render('index.html');
		}
	});





	app.post('/login',function(req,res){
		sess=req.session;
		pl.loginfo(req.body);
		pl.checkPassword(req.body.email, req.body.pass, function(success){
			if(!success){
				res.end('bad');
				return;
			}
			res.end('done');
		});
		sess.email=req.body.email;
		
	});


	app.get('/mails/:folder', function(req, res){
		var folder = req.params.folder;
		sess=req.session;
		if(sess.email)
		{
			//res.render('loading.html', {user : sess.email});
			var split = sess.email.split('@');
			pl.getMails(split[0], split[1], folder, 50, function(err, mObjects){
				if(err){
					res.render('wrong.html', {error : err});
					return;
				}
				mObjects.sort(function(a,b){
					// Turn your strings into dates, and then subtract them
					// to get a value that is either negative, positive, or zero.
					return new Date(b.date) - new Date(a.date);
				});
				res.render('mails.html', {mails : mObjects, box: folder});
			});
		}
		else
		{
			res.redirect('/');
		}
	});





	app.get('/logout',function(req,res){
		req.session.destroy(function(err){
			if(err){
				pl.loginfo(err);
			}
			else
			{
				res.redirect('/');
			}
		});
	});

	var server = app.listen(3000, function(){
		var host = server.address().address;
		var port = server.address().port;
		pl.loginfo('Example app listening at http://'+host+':'+port);

	});
	next();
};
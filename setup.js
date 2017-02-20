/*

	running this file expects that node-windows has already been installed
	this file should be run from the setup.bat file


*/



// setup mongodb as a service

var child = require('child_process');
var path = require('path');
var fs = require('fs');
var Service = require('node-windows').Service;
require('./color');

const webServiceName = 'AXtime RM';
const webServiceDescription = 'node.js web server process for AXti.me RM.';


var rootDir = __dirname.toString();
var mongoDir = path.resolve('../mongoDb')
	, mongoData = path.resolve('../databases')
	, mongoLog = mongoDir + '/mongo-log.txt'
	, axtimeRoot = path.resolve('../')
	;


function mongoExists(callback){
	child.exec('net start MongoDB', function(er, out, err){
		if (er && er.toString().indexOf('has already been started') > -1){
			callback();
		}
		else {
			callback(er + out);
		}
		
	})
}
function installMongo(callback){
	console.log('Installing MongoDB Windows Service'.green);
	var cmd = mongoDir + '\\mongod --service --dbpath=' + mongoData + ' --logpath=' + mongoLog + ' --install';
	child.exec(cmd, function(er, out, err){

		if (er){
			if (out.indexOf('moved to') > -1){
				console.log('SUCCESS'.cyan)
				callback();
			}
			else {
				console.log(('ERROR: ' + er.toString()).red);
				console.log(out.yellow);
				console.log(err.red);
				callback(er);
			}
				
		}
		else {
			console.log(out.toString().yellow);
			console.log(err.toString().red);
			callback();
		}
	});
}

function removeMongo(callback){
	console.log('Removing existing MongoDB Windows Service'.green);

	child.exec(mongoDir + '\\mongod --remove', function(er, out, err){
		if (er){
			if (out && out.indexOf('Could not find a service') > -1){
				console.log('service not installed, move on to install'.yellow);
				callback();
			}
			else {
				console.log('ERROR'.red);
				console.log(er.toString().red);
				callback(er);
			}
			
		}
		else {
			// console.log(out.toString().yellow);
			// console.log(err);
			console.log('SUCCESS removing service.'.yellow);
			callback();
		}
		
	})
}

function startMongo(callback){
	console.log('Starting the MongoDB Windows Service'.green);
	child.exec('net start MongoDB', function(er,out,err){
		if (er){
			console.log('ERROR trying to start MongoDB'.red);
			console.log(er.toString().red);
			callback(er);
		}
		else {
			console.log(out.toString().yellow);
			console.log(err.toString().red);
			callback();
		}
	});
}



function doMongo(callback){
	mongoExists(function(er){
		if (er){
			removeMongo(function(er){
				installMongo(function(er){
					if (er){
						console.log('There were errors trying to install MongoDb Windows Service.');
					}
					else {
						function start(){
							startMongo(function(er){
								if (er){
									console.log('There were errors trying to start the service.  REBOOT and run this again.');
								}
								else {
									console.log('DONE installing MongoDB.  MongoDB is running as a Windows Service.'.cyan);
								}
								callback(er);
							})
						}
						setTimeout(start, 1000);
						
					}
					
				});
			});
		}
		else {
			console.log('MongoDB is already installed and running');
			callback();
		}
	})
}

// setup website to be Windows Service 


var configExists = fs.existsSync(axtimeRoot + '/config.json');
console.log('config exists: ' + configExists);

/*
	../config.json
	{
		currentPath:''
		, past:[]
	}

*/
var config = {
	currentPath: rootDir
	, past:[]
}

if (configExists){
	try {
		var currentConfig = JSON.parse(fs.readFileSync(axtimeRoot + '/config.json'));
	}
	catch (ex){
		console.log(('ERROR parsing config.json. It must be corrupted.  Delete the file ' + axtimeRoot + '/config.json').red);
	}
}

function uninstallWebService(name, description, script, callback){
	var svc = new Service({
		name: name
		, description: description
		, script:script
	})


	svc.on('uninstall', function(){
		console.log('uninstalled existing service'.green);
		callback();
	});
	svc.on('error', function(er){
		console.log('There was an error'.red);
		console.log(er);
		callback(er);
	})

	if (svc.exists){
		svc.uninstall();
	}
	else{
		console.log('Web service does not exist.  continue.');
		callback();
	}
}

function installWebService(callback){
	var svc = new Service({
		name: webServiceName
		, description: webServiceDescription
		, script: path.join(__dirname,'server.js')
	});

	svc.on('install', function(){
		console.log('Web server Windows Service successfully installed.'.cyan);
		callback();
	});
	svc.on('invalidinstallation', function(){
		callback('Invalid installation... something is not right.  contact support.');
	})
	svc.on('alreadyinstalled', function(){
		callback('Already installed');
	})
	svc.on('error', function(er){
		console.log('There was an error'.red);
		console.log(er);
		callback(er);
	});

	if (!svc.exists){
		svc.install();
	}
	else {
		console.log('Service already exists'.red);
		callback('Service already exists');
	}
	
}

// check if existing config / service 
// delete previous service 

installWebService(function(er){
	console.log('exiting process. done.'.cyan);
});
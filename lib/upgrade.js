var request = require('request');
var azip = require('adm-zip');
var shortid = require('shortid');
var fs = require('fs');
var os = require('os');

require('../color');

var appRoot = global.appRoot;


var settings = null;
var models, io;

var upgrade = {};


upgrade.getBuilds= function(callback){
	var cv = require(appRoot + '/package.json').version
		, cvar = cv.split('.');

	if (!settings.cloudKey || settings.cloudKey.length != 32) {
		return callback('No Cloud Key entered.  Go to System Configuration and enter your Cloud Key.');
	}


	var currentVersion = {
		major:cvar[0]
		, minor: cvar[1]
		, build: cvar[2]
		, os: os.platform()
		, bits: os.arch()
	}

	//dev
	//cv = '2.1.0';

	request.get(settings.rmLiveUrl + '/api/upgrade?cloudkey=' + settings.cloudKey + '&os=' + currentVersion.os + '&bits=' + currentVersion.bits + '&cv=' + cv, function(er, res, body){
		if (er){
			console.log('error connecting to RM Live');
			console.log(er);
			callback('Error connecting to RM Live. Are you connected to the Internet?');
		}
		else if (res.statusCode === 200){
			try {
				var result = JSON.parse(body.toString());
				//console.log(body);
				callback(!result.success ? result.message : null, result.builds);
			}
			catch (ex){
				callback('Error parsing response from server: ' + ex);
			}
		}
		else 
			callback(er || 'Invalid response code: ' + res.statusCode);
	})

}

function transfer(sourceDirectory, destinationDirectory){

	sendMessage('Copying current settings to new release.');
	console.log('Copying current settings to new'.cyan)
	// update new version 
	var currentSettings = require(sourceDirectory+'/settings');
	var newSettings = require(destinationDirectory + '/settings');

	for (var n in newSettings){
		if (currentSettings[n] !== undefined){
			newSettings[n] = currentSettings[n];
		}
	}
	console.log('writing new settings..'.cyan)
	try {
		fs.writeFileSync(destinationDirectory + '/settings.js', 'module.exports=' + JSON.stringify(newSettings, null, '\t'));	
	}
	catch (ex){
		console.log(('Error writing new settings. ' + ex).red);
	}
	
	sendMessage('Copying uploaded files (course maps, etc.)');
	var baseUploadsPath = sourceDirectory + '/public/uploads';
	var newUploadsPath = destinationDirectory + '/public/uploads';
	var uploads = fs.readdirSync(baseUploadsPath);

	var start = new Date().getTime();

	console.log(('Copying ' + uploads.length + ' uploads to ' + newUploadsPath).cyan);

	for (var i = 0; i < uploads.length; i++) {
		var fn = uploads[i];
		console.log('\tcopying ' + fn);
		fs.writeFileSync(newUploadsPath + '/' + fn, fs.readFileSync(baseUploadsPath + '/' + fn));
	};
	console.log('done copying uploads in ' + (new Date().getTime() - start));
	sendMessage('done copying uploads in ' + (new Date().getTime() - start));
}

upgrade.transfer = transfer;

function sendMessage(s){
	if (io){
		io.sockets.in('admin').emit('adminmsg', s);
	}
}
function doUpgrade(buildId, callback){
	//TODO validate cloudkey
	var start = new Date().getTime();
	var tstart = start;
	var currentVersion = require(appRoot + '/package.json').version;
	

	var tmpfile = appRoot + '/../tmp-upgrade-' + buildId + '-' + shortid.generate() + '.zip';
	
	console.log('Initiating upgrade: from ' + currentVersion);
	//download build
	sendMessage('Downloading new build to ' + tmpfile);
	console.log(('downloading new build to ' + tmpfile).yellow);
	var out = fs.createWriteStream(tmpfile);

	var req = request(settings.rmLiveUrl + '/build/' + buildId + '?cloudKey=' + settings.cloudKey)
	
	req.pipe(out);

	var responseStatusCode = null;
	req.on('response',function(res){
		responseStatusCode = res.statusCode;
		console.log('response: ' + responseStatusCode)
	})

	req.on('end', function(res){
		sendMessage('Finished downloading in ' + (new Date().getTime() - start) + 'ms');
		console.log('done downloading in ' + (new Date().getTime() - start) + 'ms');
		//TODO validate build by sending current version and checking to make sure they can upgrade to it
		if (responseStatusCode == 401){
			callback('Not authorized. Invalid Cloud Key');
			sendMessage('Not authorized. Invalid Cloud Key')
		}
		else if (responseStatusCode != 200){
			callback('The download did not complete correctly (' + responseStatusCode + ')')
			sendMessage('The download did not complete correctly (' + responseStatusCode + ')')	
		}
		else {
			// wait for .5 seconds to make sure write has finished
			setTimeout(function(){
				start = new Date().getTime();
				
				try {
					var zip = new azip(tmpfile);
					var entries = zip.getEntries();
					var dirName = entries[0].entryName.replace('/','');

					if (fs.existsSync('../' + dirName)){
						fs.renameSync('../' + dirName, '../' + dirName + '-' + shortid.generate());
					}

					sendMessage('Extracting new version to ' + dirName);

					console.log(('extracting files to ' + dirName.yellow).cyan);
					// extract build	
					zip.extractAllTo(appRoot + '/../',true);
					console.log('done extracting in ' + (new Date().getTime() - start) + 'ms');
					sendMessage('done extracting in ' + (new Date().getTime() - start) + 'ms')
					start = new Date().getTime();
					
					// transfer existing files/settings to new

					transfer(appRoot, appRoot + '/../' + dirName);

					var newVersion = require(appRoot + '/../' + dirName + '/package.json').version;


					var newSiteName = 'website-' + newVersion.replace(/\./g,'-');

					sendMessage('Renaming new release directory to ' + newSiteName);
					// var archiveDirName = 'website_v' + currentVersion.replace(/\./g,'-');

					// if (fs.existsSync(appRoot + '/../' + archiveDirName)){
					// 	archiveDirName = archiveDirName + '-' + shortid.generate();
					// 	console.log('achive directory already exists, creating iteration ' + archiveDirName);
					// }



					// console.log(('Archiving current site').cyan);
					// //archive current
					// fs.renameSync('../website', '../' + archiveDirName);

					if (fs.existsSync('../' + newSiteName)){
						console.log(newSiteName + ' already exists. Quitting upgrade.');
						callback('The directory ' + newSiteName + ' already exists. Stopping upgrade.');
						return;
					}

					console.log(('Renaming ' + dirName.yellow + ' to /' + newSiteName).cyan);
					// rename new build as website
					fs.renameSync('../' + dirName, '../' + newSiteName);



					//update bat / command files
					if (os.platform().toString().toLowerCase() == 'darwin'){
						fs.writeFileSync('../START_STEP_2.command', 'cd "`dirname "$0"`"\ncd ' + newSiteName + '\nsudo node server');
					}
					else {
						console.log('Writing updated directory to /STEP_2_start_AXtimeRM.bat');
						fs.writeFileSync('../STEP_2_start_AXtimeRM.bat', 'cd ' + newSiteName + '\r\nnode server');
					}
					sendMessage('Cleaning up temporary files');

					console.log('cleaning up'.cyan);
					// delete tmp zip file
					fs.unlinkSync(tmpfile);
					console.log('deleted tmp .zip file');


					// compare current version to new version

					// archive old version

					// rename new version
					console.log('done with upgrade in a total of ' + (new Date().getTime() - tstart) + 'ms');
					sendMessage('Done with upgrade in a total of ' + (new Date().getTime() - tstart) + 'ms')
					callback(null);

				}
				catch (ex){
					console.log('Upgrade had errors. ' + ex);
					sendMessage('Upgrade had errors. ' + ex);
					callback('Error during package extraction: ' + ex);
				}
			}, 500)
				
		}
	})

	req.on('error', function(er){
		console.log('error: ' + er);
		callback('Error during download: ' + er);
		sendMessage('Error during download: ' + er);
	})

}



upgrade.doit = function(buildId, callback){
	sendMessage('Starting upgrade.');

	console.log('Starting upgrade'.cyan);
	console.log('Backing up data...'.cyan);

	sendMessage('Running data backup.');
	var start = new Date().getTime();
	//TODO duplicate
	var currentVersion = require(appRoot + '/package.json').version;
	var bk = new require('./backupRestore')({models:models, version:currentVersion})

	bk.backup.local('pre upgrade from ' + currentVersion.replace(/\./g,'-'),function(er){
		if (er){
			console.log(('backup failed.  stopping upgrade. ' + er).red);
			callback('Error during backup: ' + er);
			sendMessage('Error during backup: ' + er)
		}
		else {
			sendMessage('Backup completed successfully in ' + (new Date().getTime() - start) + 'ms');
			doUpgrade(buildId, callback)
		}
	})
}
upgrade.rename = function(){
	fs.renameSync('../website', '../teaasdf')
}
module.exports = function(_settings, _models, _io){
	settings = _settings;
	models = _models;
	io = _io;

	return upgrade;
}


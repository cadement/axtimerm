var fs = require('fs')
	//, zip = new require('node-zip')()
	, request = require('request')
	, http = require('http')
	, settings = require('../settings')
	;

var pjson = require('../package.json')
    , version = pjson.version
    , dbVersion = pjson.dbVersion;
require('date-utils');

var models = null;

var cloudBackupUrl = 'http://api.axti.me/BackupApi/Backup'//, cloudBackupUrl = 'http://axtime00000.web707.discountasp.net/api/clubBackup'
	, cloudGetBackupUrl = 'http://api.axti.me/api/downloadBackup'
	, localBackupDirectory = '../_backups';

var rmLiveUrl = 'http://live.axti.me';

if (process.env.NODE_ENV == 'dev') {
	rmLiveUrl = 'http://localhost:3000';
	console.log('dev mode: ' + rmLiveUrl)
}

//rmLiveUrl = 'http://results.axti.me';

/*
	BACKUP
 */

function createBackupFile(filename, callback){
	if (models !== null){
		console.log('Creating temporary backup file ' + filename);
		var start = new Date().getTime();
		var startall = new Date().getTime();
		var zip = new require('node-zip')();
		zip.file('settings.json', JSON.stringify(settings));
		zip.file('versions.json', JSON.stringify({version:version, dbVersion:dbVersion}));
			
		models.users.find({}, function(er,users){
			zip.file('users.json', JSON.stringify(users));
			models.clubs.find({}, function(er,clubs){
				zip.file('clubs.json', JSON.stringify(clubs));
				start = new Date().getTime();
				models.events.find({},function(er, events){

					var eventsData = '';
					for (var i = 0; i < events.length; i++) {
						eventsData += JSON.stringify(events[i]) + '\n';
					};
					
					zip.file('events.json', eventsData);
					console.log('backup events done in ' + (new Date().getTime() - start) + 'ms');
					eventsData = null;
					
					models.members.find({}, function(er, members){
						zip.file('members.json', JSON.stringify(members));
						models.participants.find({}, function(er, participants){
							zip.file('participants.json', JSON.stringify(participants));
							start = new Date().getTime();
							models.runs.find({}, function(er, runs){
								
								var runsData = '';
								for (var i = 0; i < runs.length; i++) {
									runsData += JSON.stringify(runs[i]) + '\n';
								};
								
								zip.file('runs.json', runsData);
								console.log('backup runs done in ' + (new Date().getTime() - start) + 'ms');
								runsData = null;	
								models.seasons.find({}, function(er, seasons){
									zip.file('seasons.json', JSON.stringify(seasons));
									models.times.find({}, function(er, times){
										zip.file('times.json', JSON.stringify(times));
										models.ttods.find({}, function(er, ttods){
											zip.file('ttods.json', JSON.stringify(ttods));
											
											start = new Date().getTime();
											var zippedData = zip.generate({base64:false, compression:'DEFLATE'});
											fs.writeFileSync(filename, zippedData, 'binary');
											
											console.log('write backup data done in ' + (new Date().getTime() - startall) + 'ms');
											
											callback(null);
										})
										
									})
								})
							})
						})
					})
				})
			})
		})
	}
	else {
		callback('Models data is not defined.');
	}
}

function doLocalBackup(label, callback){
	var start = new Date().getTime();
	label = label.replace(/ /g,'_');
	var filename = '/axtime-backup_' + label + '_' + new Date().toFormat('YYYY-MM-DD-HH24-MI-SS') ;
	var zipFilePath = localBackupDirectory + filename + '.zip';
	console.log('creating zipped file : ' + zipFilePath);
	createBackupFile(zipFilePath, function(er){
		console.log('done writing backup data file in ' + (new Date().getTime() - start) + 'ms');
		callback(er);
	})
}

function uploadBackupFile(localPath, cloudKey, callback){
	var url = rmLiveUrl + '/api/backup?cloudkey=' + cloudKey;

	console.log('uploading to ' + url)
	var r = request.post(url, function(er, resp, body){
		console.log('post to server done');
		
		if (er){
			callback('Uploading error: ' + er);
		} else if (resp.statusCode == 200){
			try {
				var result = JSON.parse(body);
				if (result.success){
					callback();
				} else {
					var msg = result.message | 'Unknown error.';
					callback(msg);
				}
			}
			catch (ex){
				callback(ex);
			}
				
			
		}
		else {
			callback('There was an error on the AXti.me server.  Please try again.' + body);
		}
		
	})
	var form = r.form()
	//form.append('clubKey', clubUploadKey)
	form.append('file', fs.createReadStream(localPath));
	//r.setHeader('Content-Length', form.getLengthSync());
}

function downloadBackupFile(localPath, cloudKey, filename, callback){

	var url = rmLiveUrl + '/api/backup/' + filename + '?cloudkey=' + cloudKey;

	console.log('downloading from ' + url);

	request.get(url)
		.on('error',function(er){
			console.log('get error')
			callback(er);
		})
		.on('response', function(res){
			console.log('get response');
			if (res.statusCode === 500){
				callback('There was an error retrieving the file from the server.');
			}
			else if (res.statusCode === 404){
				callback('The backup file does not exist on the server.');
			}
			else {
				console.log('statuscode:' + res.statusCode);
			}
		})
		.on('end', function(er){
			console.log('downloaded to ' + localPath);
			callback(null);
		})
		.pipe(fs.createWriteStream(localPath));



	// var r = request.get(url, function(er, resp, body){
	// 	console.log('download retured');
	// 	if (er) callback(er);
	// 	else if (resp.statusCode === 200){
	// 		console.log('saving data to ' + localPath);
	// 		var zippedData = body;
	// 		fs.writeFile(localPath, zippedData, 'binary', function(er){
	// 			if (er) console.log('ERROR writing backup file: ' + er);
	// 			callback(er);
	// 		});
	// 	}
	// 	else if (resp.statusCode === 404){
	// 		// file does not exist
	// 		callback('Backup file does not exist in the Cloud.');
	// 	}
	// 	else if (resp.statusCode === 500){
	// 		console.log(body);
	// 		callback('500 error')
	// 	}
	// 	else {
	// 		console.log(body);
	// 		callback('error ' + body);
	// 	}
	// });
}




function doCloudBackup(label, cloudKey, callback){
	var start = new Date().getTime();
	label = label.replace(/ /g,'_');
	var filename = '/axtime-backup_' + label + '_' + new Date().toFormat('YYYY-MM-DD-HH24-MI-SS') ;
	var zipFilePath = localBackupDirectory + filename + '.zip';
	console.log('creating zipped file : ' + zipFilePath);
	createBackupFile(zipFilePath, function(er){
		console.log('done writing backup data file in ' + (new Date().getTime() - start) + 'ms');
		var start2 = new Date().getTime();
		uploadBackupFile(zipFilePath, cloudKey, function(er){
			console.log('done uploading backup data file in ' + (new Date().getTime() - start2) + 'ms');
			callback(er);
		})
		
	})
}

function extractFileData(data){
	var result = [];

	var lines = data.split('\n');
	console.log('converting ' + lines.length + ' lines to json');
	for (var i = 0; i < lines.length; i++) {
		if (lines[i].length > 0)
			result.push(JSON.parse(lines[i]));
	};

	return result;
}

function extractBackupData(filePath, callback){
	console.log('Extracting zipped backup file');
	var start = new Date().getTime();
	var tstart = new Date().getTime();
	try {

		var zippedData = fs.readFileSync(filePath,'binary');
		var zip = new require('node-zip')(zippedData, {base64: false, checkCRC32: true});
		console.log('unzip duration: ' + (new Date().getTime() - start) + 'ms');

		var data = {
			users:[]
			, clubs:null
			, events:[]
			, members:[]
			, participants:[]
			, runs:[]
			, seasons:[]
			, times:[]
			, ttods:[]
			, version:''
			, dbVersion: ''
		}

		start = new Date().getTime();
		var s = zip.files['versions.json'];
		
		versions = JSON.parse(s.data);
		data.version = versions.version;
		data.dbVersion = versions.dbVersion;
		
		console.log('versions duration: ' + (new Date().getTime() - start) + 'ms');
		start = new Date().getTime();
		data.users = JSON.parse(zip.files['users.json'].data);
		console.log('users ' + data.users.length + ' duration: ' + (new Date().getTime() - start) + 'ms');
		start = new Date().getTime();
		data.clubs = JSON.parse(zip.files['clubs.json'].data);
		console.log('clubs ' + data.clubs.length + ' duration: ' + (new Date().getTime() - start) + 'ms');

		start = new Date().getTime();
		data.events = extractFileData(zip.files['events.json'].data);
		console.log('events ' + data.events.length + ' duration: ' + (new Date().getTime() - start) + 'ms');

		start = new Date().getTime();
		data.members = JSON.parse(zip.files['members.json'].data);
		console.log('members ' + data.members.length + ' duration: ' + (new Date().getTime() - start) + 'ms');

		start = new Date().getTime();
		data.participants = JSON.parse(zip.files['participants.json'].data);
		console.log('participants ' + data.participants.length + ' duration: ' + (new Date().getTime() - start) + 'ms');

		start = new Date().getTime();
		data.runs = extractFileData(zip.files['runs.json'].data);
		console.log('runs ' + data.runs.length + ' duration: ' + (new Date().getTime() - start) + 'ms');

		start = new Date().getTime();
		data.seasons = JSON.parse(zip.files['seasons.json'].data);
		console.log('seasons ' + data.seasons.length + ' duration: ' + (new Date().getTime() - start) + 'ms');

		start = new Date().getTime();
		data.times = JSON.parse(zip.files['times.json'].data);
		console.log('times ' + data.times.length + ' duration: ' + (new Date().getTime() - start) + 'ms');

		start = new Date().getTime();
		data.ttods = JSON.parse(zip.files['ttods.json'].data);
		console.log('ttods ' + data.ttods.length + ' duration: ' + (new Date().getTime() - start) + 'ms');
		//console.log(zip.files['test.file']); // hello there

		console.log('DONE extracting data in ' + (new Date().getTime() - tstart) + 'ms');
		callback(null, data);

	}
	catch (ex){
		callback(ex);
	}
}



// function getBackupData(callback){
// 	var data = {
// 		users:[]
// 		, clubs:null
// 		, events:[]
// 		, members:[]
// 		, participants:[]
// 		, runs:[]
// 		, seasons:[]
// 		, times:[]
// 		, ttods:[]
// 		, version:version
// 		, siteVersion: siteVersion
// 	}

// 	if (models !== null){
// 		models.users.find({}, function(er,users){
// 			models.clubs.find({}, function(er,clubs){
// 				models.events.find({},function(er, events){
// 					models.members.find({}, function(er, members){
// 						models.participants.find({}, function(er, participants){
// 							models.runs.find({}, function(er, runs){
// 								models.seasons.find({}, function(er, seasons){
// 									models.times.find({}, function(er, times){
// 										models.ttods.find({}, function(er, ttods){
// 											data.users = users;
// 											data.clubs = clubs;
// 											data.events = events;
// 											data.members = members;
// 											data.participants = participants;
// 											data.runs = runs;
// 											data.seasons = seasons;
// 											data.times = times;
// 											data.ttods = ttods;
// 											callback(null, data);
// 										})
										
// 									})
// 								})
// 							})
// 						})
// 					})
// 				})
// 			})
// 		})
// 	}
// 	else {
// 		callback('Models data is not defined.');
// 	}
// }


// function downloadZippedFileFromCloud(clubKey, filename, callback){
// 	console.log('downloading ' + filename + ' from cloud');
// 	var options = {
// 	    host: 'api.axti.me'
// 	  , port: 80
// 	  //, path: '/api/downloadBackup?clubKey=' + clubKey + '&fileName=' + filename
// 	  , path: '/BackupApi/Backup/' + clubKey + '?fileName=' + filename
// 	}
// 	var request = http.get(options, function(res){
// 	    var imagedata = ''
// 	    res.setEncoding('binary')

// 	    res.on('data', function(chunk){
// 	        imagedata += chunk
// 	    })

// 	    res.on('end', function(){
// 	        if (res.statusCode == 200)
// 	        	callback(null, imagedata);
// 	       	else {
// 	       		console.log('returned response code: ' + res.statusCode);
// 	       		console.log(imagedata);
// 	       		callback('ERROR: There was an error on the AXti.me server.  The backup file may not exist.')
// 	       	}

// 	    })

// 	})

// 	request.on('error', function(er){
// 		callback('ERROR: There was an error making the request to download the file.  Are you connected to the Internet?');
// 	})
// }


// function uploadZippedFileToCloud(clubUploadKey, filePath, callback){
// 	console.log('uploading')
// 	var r = request.post(cloudBackupUrl + '/' + clubUploadKey, function(er, resp, body){
// 		console.log('post to server done');
		
// 		if (er){
// 			callback('Uploading error: ' + er);
// 		} else if (resp.statusCode == 200){
// 			var result = JSON.parse(body);
// 			if (result.success){
// 				callback();
// 			} else {
// 				var msg = result.message | 'Unknown error.';
// 				callback(msg);
// 			}
			
// 		}
// 		else {
// 			callback('There was an error on the AXti.me server.  Please try again.' + body);
// 		}
		
// 	})
// 	var form = r.form()
// 	//form.append('clubKey', clubUploadKey)
// 	form.append('file', fs.createReadStream(filePath));
// 	//r.setHeader('Content-Length', form.getLengthSync());
// }

// function createZippedData(filename, callback){
	
// 	getBackupData(function(er, data){
// 		if (!er){
// 			console.log('got the data: ' + data.length);
// 			var zip = new require('node-zip')();
// 			zip.file(filename + '.json', JSON.stringify(data));
// 			var zippedData = zip.generate({base64:false, compression:'DEFLATE'})
// 			console.log('done zipping up data');
// 			callback(null, zippedData);
// 		} else {
// 			callback('There was an error backing up the data. ' + er);
// 		}
// 	});
// }

// function localBackup(backupDirectory, callback){
// 	var start = new Date().getTime();

// 	var filename = 'axtime-backup_' + new Date().toFormat('YYYY-MM-DD-HH24-MI-SS') ;
// 	var zipFilePath = backupDirectory + filename + '.zip';
// 	console.log('creating zipped file : ' + zipFilePath);
// 	createZippedData(filename, function(er, zippedData){
// 		fs.writeFile(zipFilePath, zippedData,'binary', function(er){
// 			console.log('done writing backup data file in ' + (new Date().getTime() - start) + 'ms');

// 			callback(er, zipFilePath);
			
			
// 		})
// 	})

		
// }

// function cloudBackup(backupDirectory, clubKey, callback){
// 	var filename = 'axtime-backup_' + new Date().toFormat('YYYY-MM-DD-HH24-MI-SS') ;
// 	var zipFilePath = backupDirectory + filename + '.zip';
// 	console.log('create zipped file : ' + zipFilePath);
// 	createZippedData(filename, function(er, zippedData){
// 		fs.writeFile(zipFilePath, zippedData,'binary', function(er){
// 			console.log('done writing backup data file');

// 			uploadZippedFileToCloud(clubKey, zipFilePath, function(er){
// 				console.log('done trying to upload file to cloud')
// 				callback(er, zipFilePath);
// 			})
			
// 		})
// 	})
// }


function getLocalBackups(callback){
	var files = []
        , message = '';
        
    fs.readdir(localBackupDirectory, function(er, lfiles){
        if (er) {message = er;}
        else {
            for (var i = 0; i < lfiles.length; i++) {
                if (lfiles[i].indexOf('axtime-backup') > -1){
                    var file = {fileName:'', backupDate:null, backupDateStr:''}
                    file.fileName = lfiles[i];

                    //var dp = lfiles[i].split('_')[1].split('-');
                    var dp = lfiles[i].substring(lfiles[i].lastIndexOf('_')+1).split('-');
                    //console.log(dp.join(','));
                    var bdate = new Date(dp[0], dp[1]-1,dp[2],dp[3],dp[4],dp[5].replace('.zip',''));
                    file.backupDate = bdate;
                    files.push(file);
                }
                    
                
            };
        }
        callback(er, files);
    })
}



// function getCloudBackups(clubKey, callback){
// 	request.get('http://api.axti.me/BackupApi/Backups/' + clubKey, function(er, resp, body){
//         if (er) {callback('ERROR: There was an error connecting to the AXti.me servers.  Are you connected to the Internet? ' + er)}
//         else if (resp.statusCode == 200){
//             var data = JSON.parse(body)
//                 , files = [];
//             console.log(lfiles);
//             if (data.success){
//             	var lfiles = data.data;
//             	for (var i = 0; i < lfiles.length; i++) {
	                
// 	                var file = {fileName:'', backupDate:null, backupDateStr:''}
// 	                    file.fileName = lfiles[i].FileName.split('__')[1];

// 	                    var dp = lfiles[i].FileName.split('__')[1].split('_')[1].split('-');
// 	                    var bdate = new Date(dp[0], dp[1]-1,dp[2],dp[3],dp[4],dp[5].replace('.zip',''));
// 	                    file.backupDate = bdate;
// 	                    files.push(file);
// 	            };
// 	            //res.render('restore.jade', {title:'Restore From AXti.me Cloud', source:'cloud', files:files,club:club, session:req.session, message:null})
// 	            callback(null, files);
//             }
//             else {
//             	callback(data.message);
//             }
            
//         }
//         else {
//             //res.send('AXti.me server has encountered an error retriveing your list of backups.')
//             callback('ERROR: AXti.me server has encountered an error retriveing your list of backups.');
//         }
        
//     })
// }

function getRmLiveBackups(cloudKey, callback){
	console.log('get rm live backups');

	request.get(rmLiveUrl + '/api/backup/?cloudkey=' + cloudKey, function(er, resp, body){
        if (er) {callback('ERROR: There was an error connecting to the AXti.me servers.  Are you connected to the Internet? ' + er)}
        else if (resp.statusCode == 200){
            var data = JSON.parse(body)
                , files = [];
            console.log(data);
            if (data){
            	var lfiles = data;
            	for (var i = 0; i < lfiles.length; i++) {
	                
	                var file = {fileName:'', backupDate:null, backupDateStr:''}
	                    file.fileName = lfiles[i].filename;

	                    //var dp = lfiles[i].filename.split('__')[1].split('_')[1].split('-');
	                    var dp = lfiles[i].filename.substring(lfiles[i].filename.lastIndexOf('_')+1).split('-');
	                    var bdate = new Date(dp[0], dp[1]-1,dp[2],dp[3],dp[4],dp[5].replace('.zip',''));
	                    file.backupDate = bdate;
	                    files.push(file);
	            };

	            files.sort(function(a,b){
	            	return a.backupDate < b.backupDate ? 1 : -1;
	            })

	            //res.render('restore.jade', {title:'Restore From AXti.me Cloud', source:'cloud', files:files,club:club, session:req.session, message:null})
	            callback(null, files);
            }
            else {
            	console.log('not data')
            	callback(null, []);
            }
            
        }
        else {
        	console.log('error');
            //res.send('AXti.me server has encountered an error retriveing your list of backups.')
            callback('ERROR: AXti.me server has encountered an error retriveing your list of backups.');
        }
        
    })
}





/*************************************************

	RESTORE

 *************************************************/




function restoreData(data, callback){
	var result = {
		errors:[]
	}
	var completed = {
		members:false
		, users:false
		, clubs:false
		, events:false
		, runs:false
		, times:false
		, participants:false
		, seasons:false
		, ttods:false
	}
	var restoreStart = new Date().getTime();

	for (var a in completed){
		result[a] = 0;
		startit(a);
	}

	function startit(name){
		
		if (models[name] !== undefined){
			if (data[name] !== undefined){
				models[name].remove({}).exec(function(er){
					console.log('DELETED all ' + name + ' data: ' + er);
					var start = new Date().getTime();
					if (er){
						completed[name] = true;finished();
					}
					else nextm();
					function nextm(){
						var m = data[name].shift();
						if (!m){
							completed[name] = true;
							console.log('restored ' + name + ' in ' + (new Date().getTime() - start) + 'ms');
							finished();	

						} 
						else {
							var mm = new models[name](m);
							mm.save(function(er){
								if (er) {
									result.errors.push({msg:name + ' error', type:name, obj:m});
								}
								else {
									result[name]++;
								}
								nextm();
							})	
						}
						
					}
				})
			}
			else {
				console.log('data ' + name + ' does not exist');
				result.errors.push({msg:name + ' backup data does not exist.', type:'data',obj:null});
				completed[name] = true;
				finished();
			}
		}
		else {
			console.log('model ' + name + ' does not exist');
			console.log(models)
			result.errors.push({msg:name + ' model does not exist.', type:'model', obj:null})
				completed[name] = true;
				finished();
		}
	}

	function finished(){
		//var done = true;
		for (var a in completed) {
			if (!completed[a]){
				return;
			}
		}
		console.log('done restoring data in ' + (new Date().getTime() - restoreStart) + 'ms');
		callback(result.errors.length > 0 ? 'Errors, check errors list' : null, result);
	}
}


function doCloudRestore(cloudKey, filename, callback){
	// download from cloud
	// do local restore
	var start = new Date().getTime();
	console.log('doing cloud restore');

	//TODO get rid of passing in cloudkey, require it to be entered.
	var tmpFilename = 'tmp-cloud-' + new Date().getTime() + '-' + filename;

	var localPath = localBackupDirectory + '/' + tmpFilename;
	
	downloadBackupFile(localPath, cloudKey, filename, function(er){
		console.log('download from cloud duration: ' + (new Date().getTime() - start) + 'ms');
		if (er) callback(er);
		else {
			doLocalRestore(tmpFilename, function(er){
				console.log('restore returned: ' + er);
				console.log('download and restore duration: ' + (new Date().getTime() - start) + 'ms');
				fs.unlinkSync(localPath);
				callback(er);
			});
		}
			
	})
}


function doLocalRestore(filename, callback){
	var filePath = localBackupDirectory + '/' + filename;
	var exists = fs.existsSync(filePath);
	if (exists){
		extractBackupData(filePath, function(er, data){
			//TODO stop the backup if backup version is newer

			if (er) callback(er);
			else {

				console.log('backup database version is ' + data.dbVersion);
				console.log('system is expecting ' + dbVersion);
				restoreData(data, callback);
			}
		});
	}
	else {
		callback('File does not exist.')
	}
		
}



var backup = {
	// doLocal: function(backupDirectory, callback){
	// 	console.log('backup.doLocal')
	// 	localBackup(backupDirectory, callback);
	// }
	local:doLocalBackup
	, cloud: doCloudBackup
	//, doCloud:cloudBackup
	, getLocalBackups:getLocalBackups
	, getCloudBackups: getRmLiveBackups
	//, getCloudBackups:getCloudBackups
};

var restore = {
	//doLocal: doLocalRestore
	local: doLocalRestore
	, cloud: doCloudRestore
	//, doCloud:doCloudRestore
	, extract:extractBackupData
};


module.exports = function(_config) {
	models = _config.models;
	//console.log('backupRestore constructor called');
	siteVersion = _config.version;
	if (_config.localBackupDirectory)
		localBackupDirectory = _config.localBackupDirectory;

	var exists = fs.existsSync(localBackupDirectory);

	if (!exists){
		try {
			fs.mkdirSync(localBackupDirectory);
		} catch(ex){
			console.log('ERROR CREATING BACKUP DIRECTORY: ' + localBackupDirectory);
		}
		
	}
	

	return {
		backup:backup
		, restore:restore
	}
}


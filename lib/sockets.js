
var io
	, models
	, connectedCount = 0
	, utils = require('../utils')
	, sessionStore
	, engine
	, chronos = {}
	;


function doAudit(s, d, eid) {
    var a = new models.audit();
    a.date = new Date();
    a.source = s;
    a.description = d;
    a.eventId = eid;
    a.save();
}

function ioConfig(_config) {
	io = _config.io;
	models = _config.models;
	sessionStore = _config.sessionStore;
	engine = _config.engine; //require('./engine.js')({io:io, models:models});

	function getUserById(uid, callback){
		models.users.findById(uid, function(er, user){
			callback(er, user);
		});
	}

	function authenticate(eid, role, pw, callback){
		console.log('socket: authenticate');
		console.log(eid + ', ' + role + ', ' + pw);
		var epw = utils.encrypt(pw || 'error');
		models.users.findOne({eventId: eid, role: role, epassword:epw}, function(er, user){
			if (!er && user){
				console.log('socket: authenticate success for ' + role);
				callback(true);
			} else {
				callback(false);
			}
		});
	}

	function getLiveEvent(callback){
		var todayInt = utils.date2int(new Date());
		console.log('socket: get live event');
		models.events.findOne({dateInt: todayInt}, function(er, ev){
			if (ev){

				callback(ev._id.toString());
			} else {
				callback();
			}
		});
	}

	io.sockets.on('connection', function(socket){
		connectedCount++;
		console.log('socket connected: ' + connectedCount);
		var auth = {role:null}
			, conePenalty = -1
			, eid = null // eventId
			, sessionId = null;
		
		console.log('socket sessionId: ' + socket.sessionId)
		var role = socket.user ? socket.user.role || 'Club Admin' : 'anonymous';
		console.log('\tsocket authorized as ' + role);
		if (socket.user){
			//TODO shouldn't have to default to club admin, even though the only other users are event level and always have role populated
			auth.role = role;
		}
		//TODO authorize user to club?

		socket.on('disconnect', function(){
			connectedCount--;
			console.log('socket disconnect. online:' + connectedCount);
		})


		socket.on('join', function (data) {
            //console.log('Attempting to join: ' + data.stream);
            //TODO validate eventId

            eid = data.eventId;
            //TODO authorize eid to session

            function doJoins() {
            	var qroom = eid + '-queue'
	                , rroom = eid + '-runs'
	                , rsroom = eid + '-results'
	                , mtimerroom = eid + '-manualtimer'
	                , chronoroom = eid + '-chrono'
	                , regroom = eid + '-reg'
	                , adminroom = 'admin';
	            
	            if (!eid){
	            	console.log('sockets doJoins() NO EVENT ID')
	            }
	          
	            if (data.stream == 'queue') {
	                //if (auth.role == 'Time Keeper' || auth.role == 'Cone Counter' || auth.role == 'Car Queuer' || auth.role == 'Club Admin' || auth.role == 'Event Admin') {
	                    socket.join(qroom);
	                    socket.join(rroom);
	                    socket.join(regroom);
	                    socket.join(adminroom);
	                    socket.join(chronoroom);

	                    //console.log('getting queued runs for init');
	                    models.runs.find({ eventId: eid, status: 'Q' }).sort({ runNumber: 1 }).exec(function (err, queuedRuns) {
	                        socket.emit('initq', queuedRuns);
	                        //console.log('runs found and sent');
	                    });
	                    //TODO limit the # of runs returned
	                    models.runs.find({ eventId: eid, status: 'F' }).limit(20).sort({ runNumber: -1 }).exec(function (err, runs) {
	                        socket.emit('initr', runs);
	                    });
	                    models.participants.find({eventId:eid}).sort({'driver.carNumber':1}).exec(function(er, p){
	                    	p.sort(function(a,b){
	                    		return a.driver.carNumber == b.driver.carNumber ? a.driver.name < b.driver.name : parseInt(a.driver.carNumber) - parseInt(b.driver.carNumber);
	                    	});
	                    	models.events.findById(eid).select('runGroups').exec(function(er, ev){
	                    		var rgs = [];
	                    		if (ev){
	                    			rgs = ev.runGroups;
	                    		}
	                    		socket.emit('initreg', {type:'full', participants:p, runGroups: rgs});	
	                    	});
		                    
		                });
		                if (chronos[eid] === undefined) {
		            		chronos[eid] = {}
		            		chronos[eid].starts = [];
		            		chronos[eid].splits = [];
		            	}
		                engine.timerInitChrono(socket);
	                //} 
	                
	            } else if (data.stream == 'results') {
	            	console.log('authorized to join: results stream');
	                socket.join(rsroom);
	                models.participants.find({eventId:eid}).sort({bestTime:1}).exec(function(er, p){
	                    models.ttods.findOne({ eventId: eid }, function (err, tt) {
	                        //TODO error handing
	                        socket.emit('results', {type:'full', participants:p, ttods:tt});
	                    });
	                });
	            } else if (data.stream == 'reg') {
	            	socket.join(regroom);
	            	models.participants.find({eventId:eid}).sort({'driver.name':1}).exec(function(er, p){
	                    socket.emit('initreg', {type:'full', participants:p});
	                });
	            } else if (data.stream == 'chrono'){
	            	console.log('authorized to join: chrono stream')
	            	if (chronos[eid] === undefined) {
	            		chronos[eid] = {}
	            		chronos[eid].starts = [];
	            		chronos[eid].splits = [];
	            	}
	            	socket.join(chronoroom);
	            	engine.timerInitChrono(socket);
	            	//io.sockets.in(chronoroom).emit('chrono', {starts:chronos[eid].starts, splits:chronos[eid].splits, stamp:new Date().getTime()})
	            } else if (data.stream == 'manualtimer') {
	            	console.log('authorized to join: manualtimer stream');
	            	// if (chronos[eid] === undefined) {
	            	// 	chronos[eid] = {}
	            	// 	chronos[eid].starts = [];
	            	// 	chronos[eid].splits = [];
	            	// }
	                socket.join(mtimerroom);
	            } else if (data.stream == 'admin'){
	            	socket.join(adminroom);
	            } 
            }

            if (!eid){
            	getLiveEvent(function(lid){
            		if (lid){
            			eid = lid;
            			if (data.authenticate){
			           		var role = data.role
			           			, pw = data.password;

			           		authenticate(eid, role, pw, function(isValid){
			           			if (isValid){
			           				auth.role = role;
			           			} else {
			           				auth.role = null;
			           			}
			           			doJoins();	
			           		});
			           	}
            		}
            	});
            }
           	else if (data.authenticate){
           		var role = data.role
           			, pw = data.password;

           		authenticate(eid, role, pw, function(isValid){
           			if (isValid){
           				auth.role = role;
           			} else {
           				auth.role = null;
           			}
           			doJoins();	
           		});
           	} else {
           		doJoins();
           	}
            
            
        }); //socket.join
		

		/*****************************************************************

			helpers

		*****************************************************************/


		

		function print(nrun){
			console.log(nrun.runNumber + '- ' + nrun.driver.name + ' #' + nrun.driver.carNumber + ', ' + nrun.axClass.name + ', ' + nrun.totalTime + ', ' + nrun.paxTime);			
		}

		function sendError(msg){
			socket.emit('message', { message: msg });
		}

		socket.on('deleterunkeeptimes', function(data){
			console.log('deleterunkeeptimes');
			if (auth.role == 'Time Keeper'
                || auth.role == 'Event Admin' || auth.role == 'Club Admin') {
				//TODO validate user
				var runId = data;
				
				engine.deleteRunKeepTimes(eid, runId, function(er){
					if (er) sendError(er);
				})
				
					
			} else {
				sendError('You are not authorized or allowed to do this.');
			}
		})
		socket.on('quickchange', function(data){
			var runId = data.runId 
				, time = parseFloat(data.time) 
				, cones = data.cones 
				, penalty = data.penalty;

			if (auth.role == 'Time Keeper'
                || auth.role == 'Event Admin' || auth.role == 'Club Admin') {

				//TODO validate data coming in
                var aud = new models.audit();
                aud.date = new Date();
                aud.source = auth.role;
                aud.description = 'changed run - ' + runId + ' - ' + time + ',' + cones + ',' + penalty;
                aud.eventId = eid;
                aud.save();

				engine.runQuickChange(eid, runId, time, cones, penalty, function(er){
					if (er) sendError(er);
				})
			} else {
				sendError('You are not authorized or allowed to do this.');
			}

		});

		socket.on('runswapdriver', function(data){
			var runId = data.runId
				, participantId = data.participantId;
			if (auth.role == 'Time Keeper' || auth.role == 'Event Admin' || auth.role == 'Club Admin') {
				engine.runSwapDriver(eid, runId, participantId, function(er){
					if (er) sendError(er);
				})
			} else {
				sendError('You are not authorized or allowed to do this.');
			}

		})

		socket.on('changetimemoveup', function(data){
			console.log('changetimesmoveup');
			if (auth.role == 'Time Keeper' || auth.role == 'Event Admin' || auth.role == 'Club Admin') {
				
				var runId = data.runId
					, newTime = data.newTime;

				engine.changeTimeMoveUp(eid, runId, newTime, function(er){
					if (er) sendError(er);
				})	
			} else {
				sendError('You are not authorized or allowed to do this.');
			}
		})
		var starts = []
			, splits = [];

		socket.on('manualtimer', function(data){
			var chronoroom = eid + '-chrono';
            if (auth.role == 'Time Keeper'
                || auth.role == 'Event Admin' || auth.role == 'Club Admin') {
	            
            	console.log('manualtimer: ' + JSON.stringify(data));
            	var action = data.action;

	            function add() {
	                // add time to db
	                var startStamp = starts.shift();
	                var splitStamp = splits.shift();

	                var time = new models.times();
	                time.eventId = eid;
	                time.start = null;
	                time.finish = null;
	                time.time = data.time;
	                time.timestamp = new Date().getTime();
	                time.save(function (er) {
	                    //lookup next run in queue
	                    models.runs.findOne({ eventId: eid, status: 'Q' }).sort({ 'runNumber': 1 }).exec(function (err, mrun) {
	                        if (mrun) {
	                            mrun.rawTime = data.time;
	                            mrun.totalTime = Math.round((data.time + (mrun.cones * conePenalty)) * 1000) / 1000;
	                            pax = Math.floor((data.time + (mrun.cones * conePenalty)) * mrun.axClass.index * 1000) / 1000;
	                            //console.log(pax);
	                            mrun.paxTime = pax;
	                            mrun.status = 'F';
	                            mrun.finishTimestamp = data.timestamp;
	                            mrun.splitTimes = data.splits;
	                            mrun.save(function (errr) {
	                                //io.sockets.in(eid + '-queue').emit('delq', mrun._id);
	                                //io.sockets.in(eid + '-runs').emit('addr', mrun);
	                                //finishRun(eid, mrun, false);
	                                time.runId = mrun._id;
	                                time.save();
	                                engine.finishRun(eid, mrun, false);
	                                io.sockets.in(eid + '-manualtimer').emit('message', { status:'success', run: mrun });
	                                //io.sockets.in(eid + '-').emit('update', {starts:starts, splits:splits})
	                            });
	                        } else {
	                            io.sockets.in(eid + '-manualtimer').emit('message', { status:'norun' });
	                        }
	                    });
	                }); //time.save
	            } //fx add()



	            function doit(){
	            	if (action == 'start'){
		            	//starts.push(data.stamp);
		            	console.log('start received');
		            	//chronos[eid].starts.push(data.stamp);
		            	//console.log('starts count: ' + chronos[eid].starts.length);
		            	engine.timerStart(data.stamp);
	                    //io.sockets.in(chronoroom).emit('chrono', {starts:chronos[eid].starts, splits:chronos[eid].splits, stamp:new Date().getTime()})
		            }
		            else if (action == 'split'){
		            	console.log('split received: ')
		            	//chronos[eid].splits.push(data.stamp);
		            	//console.log('split count: ' + chronos[eid].splits.length);
		            	//io.sockets.in(chronoroom).emit('chrono', {starts:chronos[eid].starts, splits:chronos[eid].splits, stamp:new Date().getTime()})
		            	//var splitNum = 0;
		            	engine.timerSplit(data.splitNum, data.time, data.stamp);
		            }
		            else if (action == 'finish'){
		            	//add();
		            	// chronos[eid].starts.shift();
		            	// chronos[eid].splits.shift();
		            	engine.timerStop(data.time, data.stamp, data.splits, function(er){
		            		//io.sockets.in(chronoroom).emit('chrono', {starts:chronos[eid].starts, splits:chronos[eid].splits, stamp:new Date().getTime()})
		            	})
	                    
		            }
		            else if (action == 'clear'){
		            	// chronos[eid].starts = [];
		            	// chronos[eid].splits = [];
		            	// io.sockets.in(chronoroom).emit('chrono', {starts:chronos[eid].starts, splits:chronos[eid].splits, stamp:new Date().getTime()})
		            	engine.timerReset();
		            }
		            else if (action == 'resetfinish'){
		            	engine.timerResetFinish(function(er){
		            		//TODO handle error
		            	});
		            	// models.runs.findOne({eventId: eid, status:'F'}).sort({runNumber:-1}).exec(function(er, run){
		            	//     if (er) console.log('ERROR finding last finished run during resetFinish. ' + er);
		            	//     else if (run != null){
		            	//         engine.resetFinish(eid, run._id.toString());
		            	//         //TODO need call back on resetfinish
		            	//         //io.sockets.in(eid + '-manualtimer').emit('message', { status:'success', run: mrun });
		            	//     }
		            	// })
		            }
		            else if (action == 'resetstart'){
		            	engine.timerResetStart(function(er){
		            		// TODO handle error
		            	})
		            }
	            }

	            if (conePenalty == -1) {
	                var dt = utils.date2int(new Date());
	                console.log('looking for live event or cone penalty for ' + dt);
	                models.events.findOne({ dateInt: dt }, function (er, ev) {
	                    if (ev) {
	                        
	                        conePenalty = ev.conePenalty;
	                        
	                        doit();
	                    } else {
	                        console.log('NO LIVE EVENT found'.red);
	                    }
	                });
	            }
	            else
	            	doit();

	            
	            
	        } // if auth
        }); // on(manualtimer)


		socket.on('addq', function (data) {
			if (auth.role == 'Time Keeper' || auth.role == 'Car Queuer' 
                || auth.role == 'Event Admin' || auth.role == 'Club Admin') {
                
                doAudit(auth.role, 'Add to queue.' + JSON.stringify(data), eid);
            
                if (data.carNumber == '___')
                	engine.addUnknownToQueue(eid, data.position, function(er){
                		if (er) sendError(er);
                	})
               	else
	                engine.addQueue(eid, data.memberId, data.participantId, data.carNumber, data.position, function(er){
	                	if (er) sendError(er);
	                });
        	} // if auth
        	else {
        		console.log('ADDQ attempted but not authorized')
        	}
        }); // on addq

		
		socket.on('reordq', function(data){
			// data = [runid, pos]
			
			if (auth.role == 'Time Keeper' || auth.role == 'Event Admin' || auth.role == 'Club Admin' || auth.role == 'Car Queuer') {
				engine.reorderQueue(eid, data, function(er){
					if (er) sendError(er);
				})
			}
		}); // socket reordq


		socket.on('delq', function (data) {
			if (auth.role == 'Time Keeper' || auth.role == 'Event Admin' || auth.role == 'Club Admin' || auth.role == 'Car Queuer') {
	            doAudit(auth.role, data + ': Delete queue entry', eid);
	            
	            engine.deleteQueue(eid, data, function(er){
	            	if (er) sendError(er);
	            });
	        }
        }); // socket delq

		socket.on('cones', function (data) {
            //data = {rid(run id), inc (1,-1)}
                    //console.log('updating cone count'.red);
            if (auth.role == 'Time Keeper' || auth.role == 'Cone Counter' 
                || auth.role == 'Event Admin' || auth.role == 'Club Admin') {
            	var runId = data.rid
            		, increment = data.inc 
            		, stream = data.stream;

	            engine.conesBasic(eid, runId, increment, stream, function(er){
	            	if (er) sendError(er);
	            })
			}
        }); // socket cones


        socket.on('conesadv', function (data) {
                    //data = {rid(run id), cones (1-7), station (num),  penalty (none,rerun,off,dnf}, action:add,remove
            if (auth.role == 'Time Keeper' || auth.role == 'Cone Counter' 
                || auth.role == 'Event Admin' || auth.role == 'Club Admin') {
            	var runId = data.rid
            	    , action = data.action
            	    , station = data.station
            	    , cones = data.cones
            	    , penalty = data.penalty
            	    , stream = data.stream;
            	    engine.conesAdvanced(eid, runId, action, station, cones, penalty, stream, function(er){
            	    	if (er) sendError(er);
            	    })

                
			} // if auth
			else 
			{
				console.log('unauthorized call to conesadv');
			}
        }); // socket conesadv


		socket.on('backr', function (data) {
			if (auth.role == 'Time Keeper' || auth.role == 'Event Admin' || auth.role == 'Club Admin') {
	            var rid = data.rid;
	            // console.log('Convert run back to queue.');
	            doAudit(auth.role, rid + ':Move run back to queue. ', eid);
	            engine.resetFinish(eid, rid);
			}
        }); // socket backr


        socket.on('delr', function (data) {
        	if (auth.role == 'Time Keeper' || auth.role == 'Event Admin' || auth.role == 'Club Admin') {
	            doAudit(auth.role, data + ': Delete run', eid);
	            var start = new Date().getTime();
	            //console.log('delete run: ' + data + ' in event ' + eid);
	            engine.deleteRun(eid, data, function(er){
	            	console.log('deleted run');
	            	console.log('error: ' + er);
	            	if (er) {
	            		console.log('sending error ' + er);
	            		sendError(er);
	            	}
	            })
			}
        }); // socket delr


        socket.on('finq', function (data) {
        	if (auth.role == 'Time Keeper' || auth.role == 'Event Admin' || auth.role == 'Club Admin') {
	            doAudit(auth.role, data.rid + ': Finish run.  ' + JSON.stringify(data), eid);
	            var bestTimeImproved = false, bestPaxImproved = false, isUpdate = false;
	            
	            //data = {rid, time, cones, dnf, off, rerun}

	            var runId = data.rid 
	            	, time = data.time 
	            	, cones = data.cones
	            	, dnf = data.dnf 
	            	, off = data.off 
	            	, rerun = data.rerun
	            	;

	            engine.finishQueue(eid, runId, time, cones, dnf, off, rerun, function(er){
	            	if (er) sendError(er);
	            })
			}
        }); // socket finq


	}) //io.on connection
}

module.exports = ioConfig;

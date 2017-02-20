var models, io
	, engine = {}
    , hardware
	//, leaderboard = require('./leaderboard');
    , leaderboard = {} //
    , config = {
        liveEventId:null
        , conePenalty:-1
        , splitCount:0
    }
    , utils = require('../utils')
    ;

require('date-utils');

var olr;

var fs = require('fs');

        /*****************************************************************

            helpers

        *****************************************************************/


// function perfo(){
//     return {start:new Date().getTime(), result:'', changeCount:0,end:null, finishEnd:null, finishDuration:0, endDuration:0};
// }


function replaceTime(newTime, newTimestamp, newRunNumber, run, conePenalty){

    run.rawTime = newTime;
    if (newRunNumber > 0)
        run.runNumber = newRunNumber;
    run.finishTimestamp = newTimestamp;

    run.totalTime = newTime + (conePenalty * run.cones);
    run.paxTime = Math.floor(run.totalTime * run.axClass.index * 1000) / 1000;
    run.status = 'F';

    return run;
}

function doMoveTimesUp(eid, runs, newTime, newTimestamp, conePenalty){
    var list = runs.slice(0);
    var queueDone = false;
    var time = newTime
        , timestamp = newTimestamp
        ;
    function doit(){
        if (list.length > 0){
            var run = list.shift();
            var oTime = run.rawTime
                , oTimestamp = run.timestamp
                , oStatus = run.status;

            if (!queueDone){
                var nrun = replaceTime(time, timestamp, 0, run, conePenalty);

                nrun.save(function(er){
                    if (er){
                        console.log('ERROR saving run after time replacement');
                    } else {

                        time = oTime;
                        timestamp = oTimestamp;
                        finishRun(eid, nrun, oStatus == 'F');
                        queueDone = oStatus == 'Q';
                        doit();
                    }
                })
            } 
        }
    }
    doit();
}
function doReplaceTime(eid, runs, newTime, newTimestamp, newRunNumber, conePenalty){
    var list = runs.slice(0);
    var queueDone = false;
    var time = newTime
        , timestamp = newTimestamp
        , runNumber = newRunNumber;
    function doit(){
        if (list.length > 0){
            var run = list.shift();
            var oTime = run.rawTime
                , oTimestamp = run.finishTimestamp
                , oRunNumber = run.runNumber
                , oStatus = run.status;

            if (!queueDone){
                var nrun = replaceTime(time, timestamp, runNumber, run, conePenalty);

                nrun.save(function(er){
                    if (er){
                        console.log('ERROR saving run after replacement. ' + er);
                    } else {

                        time = oTime;
                        timestamp = oTimestamp;
                        runNumber++;
                        finishRun(eid, nrun, oStatus == 'F');
                        queueDone = oStatus == 'Q';
                        doit();
                    }
                })
            } else {
                run.runNumber = runNumber;
                run.save(function(er){
                    if (er)
                        console.log('ERROR saving queued new runNumber after moving');
                    else{
                        runNumber++;
                        doit();
                    }
                })
            }
        }
    }
    doit();
}

// takes run and places it back in the queue. 
// scenario: someone tripped the finish line.
function resetFinish(eventId, runId){
    console.log('Convert run back to queue.');

    var eid = eventId
        , rid = runId;

    //var perf = new perfo();
    //doAudit(auth.role, rid + ':Move run back to queue. ', eid);

    models.events.findById(eid).select('_id maxRunsPerDriver season club.id totalRuns conePenalty eventNumber').exec(function (er1, ev) {
        if (ev) {
            models.runs.findOne({ _id: rid, eventId: eid },function (err, q) {
                if (q) {
                    q.status = 'Q';
                    q.rawTime = 0;
                    q.paxTime = 0;
                    q.save(function (er) {
                        //TODO handle error
                        models.participants.findById(q.participantId, function (erp, part) {
                            if (part) {
                                ev.totalRuns = ev.totalRuns - 1;
                                ev.save();
                                //TODO handle error during event save
                                //TODO should do an initq here to reorder things
                                io.sockets.in(eid + '-queue').emit('addq', {run:q});
                                io.sockets.in(eid + '-runs').emit('delr', q._id);
                                //calcRun(q, part._id, true, true, true);
                                // perf.finishEnd = new Date().getTime();
                                // perf.finishDuration = perf.finishEnd - perf.start;
                                calcRun(q, part._id, true, true, true, ev, true, null);
                                

                            } else {
                                console.log('part record not found');
                            }
                        });
                    });
                }
                else {
                    console.log('run not found: ' + rid);
                }

            });
        } else {
            //TODO handle error
            console.log('event not found: ' + eid);
        }
    });
}


//TODO this is not scalable for running multi club's events in the same system/day
function setLiveEvent(callback){
    var dt = utils.date2int(new Date());
    console.log('looking for live event or cone penalty for ' + dt);
    //TODO make below accurate, ie. for club
    models.events.findOne({ dateInt: dt }).select('_id conePenalty numberOfSplits dateInt').exec(function (er, ev) {
        if (ev) {
            var eid = ev._id.toString();
            config.conePenalty = ev.conePenalty;
            config.liveEventId = ev._id.toString();
            config.splitCount = ev.numberOfSplits;
            //console.log(config);
            if (chrono[eid] === undefined) {
                chrono[eid] = {};
                chrono[eid].starts = [];
                //TODO make multi split enabled
                chrono[eid].splits = [];
                chrono[eid].lastStart = null;
                chrono[eid].lastSplit = null;
                //TODO make splits allow for multiple
            }
            callback();
        } else {
            console.log('NO LIVE EVENT found'.red);
            callback('No live event found.');
        }
    });
}

function checkLiveEvent(callback){
    if (config.liveEventId != null){
        callback();
    } else {
        setLiveEvent(function(er){
            if (er) console.log(er);
            else {
                callback();
            }
        });
    }
}



engine.resetOlr = function(){
    console.log('engine.resetolr');
    checkLiveEvent(function(){
        if (config.liveEventId){
            olr.setEvent(config.liveEventId, function(er){
                //TODO handle error
                console.log('done with resetolr');
            });
        }    
    });
    
};

/*

        HARDWARE TIMING EVENTS

*/



function reinsertLastFinish(){
    var starts = []
        , splits = [];

    if (chrono[config.liveEventId].lastStart !== null){
        starts.push(chrono[config.liveEventId].lastStart);
    }
    if (chrono[config.liveEventId].lastSplit !== null){
        splits.push(chrono[config.liveEventId].lastSplit);
    }
    for (var i = 0; i < chrono[config.liveEventId].starts.length; i++) {
        starts.push(chrono[config.liveEventId].starts[i]);
    }
    for (var i = 0; i < chrono[config.liveEventId].splits.length; i++) {
        splits.push(chrono[config.liveEventId].splits[i]);
        //TODO make multi splits enabled
    }

    chrono[config.liveEventId].starts = starts;
    chrono[config.liveEventId].splits = splits;

}

engine.timerResetFinish = function (callback){
    checkLiveEvent(function(){
        doit();
    });
    function doit(){
        onCourseCount++;
        reinsertLastFinish();
        engine.timerUpdateChrono();
        models.runs.findOne({eventId: config.liveEventId, status:'F'}).sort({runNumber:-1}).exec(function(er, run){
            if (er) {
                console.log('ERROR finding last finished run during resetFinish. ' + er);
                callback('ERROR finding last finished run during resetFinish. ' + er)
            }
            else if (run){
                engine.resetFinish(config.liveEventId, run._id.toString());
                callback();
            }
            else {
                callback('There was no finished runs to reset.')
            }
        })
    }
}

//TODO finish this
engine.timerResetStart = function(){
    console.log('engine, timer reset start');
    if (chrono[config.liveEventId] && chrono[config.liveEventId].starts !== undefined){
        //if (chrono[config.liveEventId].starts.length)
        //TODO remove split time too if length of starts = length of splits
        chrono[config.liveEventId].starts.pop();
        engine.timerUpdateChrono();
    }
    //callback('not implemented');

}


// "normal" mode of receiving only a finished time
engine.timerFinish = function (time, timestamp, callback){
    // add time to db

    checkLiveEvent(function(){
        doit();
    })
    function doit(){
        var eid = config.liveEventId;
        var ti = new models.times();
        ti.eventId = eid;
        ti.start = null;
        ti.finish = null;
        ti.time = time;
        ti.timestamp = timestamp;
        ti.save(function (er) {
            //lookup next run in queue
            models.runs.findOne({ eventId: eid, status: 'Q' }).sort({ 'runNumber': 1 }).exec(function (err, mrun) {
                if (mrun) {
                    mrun.rawTime = time;
                    mrun.totalTime = time > 0 ? (Math.round((time + (mrun.cones * config.conePenalty)) * 1000) / 1000) : 0;
                    pax = time > 0 ? (Math.floor(mrun.totalTime * mrun.axClass.index * 1000) / 1000) : 0;
                    //console.log(pax);
                    mrun.paxTime = pax;
                    mrun.status = 'F';
                    mrun.finishTimestamp = timestamp;
                    mrun.save(function (errr) {
                        
                        ti.runId = mrun._id;
                        ti.save();
                        callback();
                        engine.finishRun(eid, mrun, false);
                    });
                }
                else {
                    callback('There was no driver in the queue.', ti);
                }
            });
        }); //time.save
    }
    
}

var onCourseCount = 0
    , chrono = {};

engine.timerInitChrono = function (socket){
    checkLiveEvent(function(){
        socket.emit('chrono', {starts:chrono[config.liveEventId].starts, splits:chrono[config.liveEventId].splits, timestamp:new Date().getTime()})
    });
}

engine.timerReset = function(){
    checkLiveEvent(function(){
        chrono[config.liveEventId].starts = [];
        chrono[config.liveEventId].splits = [];
        chrono[config.liveEventId].lastStart = null;
        chrono[config.liveEventId].lastSplit = null;
        engine.timerUpdateChrono();
        if (hardware){
            hardware.reset();
        }
    })
}

engine.timerUpdateChrono = function(){
    io.sockets.in(config.liveEventId + '-chrono').emit('chrono', {starts:chrono[config.liveEventId].starts, splits:chrono[config.liveEventId].splits, timestamp:new Date().getTime()});
}

engine.timerStart = function(timestamp){
    // data = {timestamp:}
    onCourseCount++;
    checkLiveEvent(function(){
        console.log('start line triggered');
        chrono[config.liveEventId].starts.push(timestamp);
        engine.timerUpdateChrono();
    })
    
}

// for chrono mode finish
engine.timerStop = function(time, timestamp, splits, callback){
    onCourseCount--;
    //TODO merge this with engine.timerFinish? would need to deal with splits?
    checkLiveEvent(function(){
        doit();
    })
    function doit(){
        var eid = config.liveEventId;
        var startStamp = chrono[eid].starts.shift();
        //TODO make multi split enabled
        var splitTime = chrono[eid].splits.shift();
        chrono[eid].lastStart = startStamp;
        if (splitTime !== undefined)
            chrono[eid].lastSplit = splitTime;
        // console.log('lastStart: ' + startStamp);
        // console.log('lastSplit: ' + splitTime);
        var ti = new models.times();
        ti.eventId = eid;
        ti.start = null;
        ti.finish = null;
        ti.time = time;
        ti.timestamp = timestamp;
        ti.save(function (er) {
            //lookup next run in queue
            models.runs.findOne({ eventId: eid, status: 'Q' }).sort({ 'runNumber': 1 }).exec(function (err, mrun) {
                if (mrun) {
                    mrun.rawTime = time;
                    mrun.totalTime = time > 0 ? (Math.round((time + (mrun.cones * config.conePenalty)) * 1000) / 1000) : 0;
                    pax = time > 0 ? (Math.floor(mrun.totalTime * mrun.axClass.index * 1000) / 1000) : 0;
                    //console.log(pax);
                    mrun.paxTime = pax;
                    mrun.status = 'F';
                    mrun.finishTimestamp = timestamp;
                    var tsplits = [];
                    if (splits.length > 0){
                        if (splits[0] != null)
                            tsplits = splits;
                    }
                    mrun.splitTimes = tsplits;
                    mrun.save(function (errr) {
                       
                        ti.runId = mrun._id;
                        ti.save();
                        callback();
                        engine.finishRun(eid, mrun, false);
                        engine.timerUpdateChrono();
                    });
                }
                else {
                    callback('There was no driver in the queue.', ti);
                    engine.timerUpdateChrono();
                }
            });
        }); //time.save
    }

    // //TODO remove these bits of code and replace with checkLiveEvent
    // if (config.liveEventId != null){
    //     doit();
    // } else {
    //     setLiveEvent(function(er){
    //         if (er) console.log(er);
    //         else {
    //             doit();
    //         }
    //     })
    // }
}

engine.timerSplit = function(splitIndex, time, timestamp, callback){
    checkLiveEvent(function(){
        doit();
    })

    function doit(){
        chrono[config.liveEventId].splits.push(time);
        engine.timerUpdateChrono();
        //io.sockets.in(config.liveEventId + '-chrono').emit('chrono', {starts:chrono[eid].starts, splits:chrono[eid].splits, stamp:new Date().getTime()})
        //TODO make this multi split enabled
    }
}









engine.deleteRunKeepTimes = function(eid, runId, callback){

    // var perf = new perfo();
    // perf.source = 'deleteRunKeepTimes';
    models.events.findById(eid).select('_id maxRunsPerDriver season club.id totalRuns conePenalty eventNumber').exec(function(er, ev){
        
        models.runs.findById(runId, function(er,run){
            if (er){
                callback('ERROR: ' + er);
            } else if (!run){
                callback('RUN not found')
            } else {
                
                var origTime = run.rawTime
                    , origRunNumber = run.runNumber
                    , origTimestamp = run.timestamp
                    , removeRunId = run._id
                    , participantId = run.participantId;
    
                models.runs
                    .find({ eventId: eid}).where('runNumber').gt(origRunNumber)
                    .sort({runNumber:1})
                    .exec(function(er,runs){
                        
                        //only do this if there are runs above it
                        if (runs.length > 0){
                            //update original run with new driver info
                            run.remove(function(er){
                                if (er){
                                    callback('Error deleting original run. ' + er);
                                } else {
                                    io.sockets.in(eid + '-runs').emit('delr', removeRunId);
                                    
                                    //TODO should add callback to this
                                    doReplaceTime(eid, runs, origTime, origTimestamp, origRunNumber, ev.conePenalty);

                                    callback(null);
                                    models.participants.findById(participantId, function (erp, part) {

                                        ev.totalRuns = ev.totalRuns - 1;
                                        ev.save();
                                        // perf.finishEnd = new Date().getTime();
                                        // perf.finishDuration = perf.finishEnd - perf.start;
                                        calcRun(run, participantId, true, true, true, ev, true, null);
                                        //TODO update event .totalRuns

                                    });
                                }
                            });

                        }
                        else 
                            callback(null);
                    })
            }
        });
    })
}


engine.changeTimeMoveUp = function(eid, runId, newTime, callback){
    console.log('changing time to:' + newTime);
    // function sendError(msg){
    //  socket.emit(msg);
    // }

    models.events.findById(eid).select('_id conePenalty').exec(function(er, ev){
        console.log('event done');
        models.runs.findById(runId, function(er,run){
            if (er){
                callback('Error retrieving run: ' + er);
            } else if (!run){
                callback('RUN not found')
            } else {
                
                //update run with passed in new time
                var origTime = run.rawTime
                    , origTimestamp = run.finishTimestamp
                    , origRunNumber = run.runNumber
                    ;

                var nnrun = replaceTime(newTime, new Date(), 0, run, ev.conePenalty);
                nnrun.save(function(er){
                    if (er) {console.log('error saving run while changing the time.' + er)}
                    else {
                        engine.finishRun(eid, nnrun, true);
                    }
                });
                
                models.runs
                    .find({ eventId: eid}).where('runNumber').gt(origRunNumber)
                    .sort({runNumber:1})
                    .exec(function(er,runs){
                        console.log('reordering  runs; ' + runs.length);
                        //only do this if there are runs above it
                        if (runs.length > 0){
                            //update original run with new driver info
                            doMoveTimesUp(eid, runs, origTime, origTimestamp, ev.conePenalty);
                        }
                    })
                //  }
                //})

            }
        });
    })
}


engine.runSwapDriver = function(eid, runId, participantId, callback){
    models.events.findById(eid).select('_id conePenalty').exec(function(er, ev){
        console.log('event done');
        models.runs.findById(runId, function(er,run){
            if (er){
                callback('Error getting run from database. ' + er);
            } else if (!run){
                callback('Run not found');
            } else {
                models.participants.findById(participantId, function(er, part){
                    if (er)
                        callback('Error getting participant from database. ' + er);
                    else if (part == null)
                        callback('Participant not found.');
                    else {
                        run.memberId = part.memberId;
                        run.participantId = part._id.toString();
                        run.driver = part.driver;
                        run.axClass = part.axClass;
                        run.runGroup = part.runGroup;
                        run.driverRunNumber = part.totalRuns + 1;
                        run.paxTime = Math.floor(run.totalTime * run.axClass.index * 1000) / 1000;
                        run.save(function(er){
                            if (er)
                                callback('Error saving run: ' + er);
                            else {
                                finishRun(eid, run, true);
                                callback(null, run);
                            }
                        })
                    }
                });
            }
        });
    });
}


engine.reorderQueue = function(eid, data, callback){
    models.events.findOne({_id:eid}).select('uploadResults').exec(function(er, ev){
        models.runs.find({ eventId: eid, status: 'Q' }).sort({ runNumber: 1 }).exec(function (err, queuedRuns) {
            if (queuedRuns.length > 0){
                var baseRunNumber = queuedRuns[0].runNumber;
                console.log(data);
                for (var i=0;i<queuedRuns.length;i++){
                    var found = false;
                    
                    for (var pos = 0;pos < data.length;pos++){
                        if (queuedRuns[i]._id.toString() == data[pos].runId){
                            console.log(queuedRuns[i].driver.name);
                            queuedRuns[i].runNumber = baseRunNumber + parseInt(data[pos].pos);
                            queuedRuns[i].save();
                            //TODO should make this async to capture any errors
                            found = true;
                            break;
                        }
                    }
                }

                queuedRuns.sort(function(a,b){
                    return a.runNumber < b.runNumber ? -1 : 1;
                })

                io.sockets.in(eid + '-queue').emit('initq', queuedRuns);
                if (ev.uploadResults){
                    olr.update(eid, 'initq', queuedRuns);
                }

                callback(null);
            }
            else
                callback(null);
        });
    });
}

engine.deleteRun = function(eid, runId, callback){
    var start = new Date().getTime();

    models.events.findOne({ _id: eid }).select('_id maxRunsPerDriver season club.id totalRuns conePenalty eventNumber').exec(function (er2, event) {
        models.runs.findOne({ _id: runId, eventId: eid }, function (err, r) {
            var participantId = r.participantId;
            var originalRunNumber = r.runNumber;
            
            r.remove(function (er) {
                if (!er) {
                    io.sockets.in(eid + '-runs').emit('delr', runId);
                    
                    callback(null);

                    models.runs.update({eventId: eid, runNumber: {$gt: originalRunNumber}}, {$inc: {runNumber: -1}}, {multi: true}, function(er, cnt){
                        renumberParticipantRuns(participantId, function(er){
                            models.participants.findById(participantId, function (erp, part) {

                                event.totalRuns--;
                                event.save();
                                var dur = new Date().getTime() - start;
                                console.log('delete run duration: ' + dur + 'ms');
                                //calcRun(r, part._id, true, true, true);
                                calcRun(r, part._id, true, true, true, event, true);
                                //TODO update event .totalRuns

                            });
                        });
                    });
                }
                else 
                    callback('Error removing run. ' + er);
            }); //r.remove()
        });//models.runs.One
    }); //model.events
}

engine.deleteQueue = function(eid, runId, callback){
    models.events.findOne({_id:eid}).select('uploadResults').exec(function(er, ev){
        models.runs.findOne({ _id: runId, eventId: eid }, function(er, drun){
            var delRunNumber = drun.runNumber;
            drun.remove(function (er, q) {
                //console.log(q);
                io.sockets.in(eid + '-queue').emit('delq', runId);
                
                if (ev.uploadResults){
                    olr.update(eid, 'delq', runId);
                }

                //renumber runs above
                models.runs.update({eventId: eid, status:'Q', runNumber: { $gt: delRunNumber}}, {$inc: {runNumber: -1}}, {multi: true}, function(er, cnt){

                });
            });
        });
    }) 
}


/*

            CONES

*/

engine.conesAdvanced = function(eid, runId, action, station, cones, penalty, stream, callback) {

    models.runs.findOne({ _id: runId, eventId: eid }, function (er, r) {
        if (r) {
            models.events.findById(eid).select('_id maxRunsPerDriver season club.id totalRuns conePenalty eventNumber').exec(function(er, tevent){
                var total = r.cones;
                var orig = r.cones;

                //TODO remove it cones == 0
                if (action == 'remove') {
                    console.log('remove cones')
                    var tmp = []
                        , sum = 0;

                    for (var i = 0; i < r.coneHits.length; i++) {
                        if (r.coneHits[i].station != station) {
                            tmp.push(r.coneHits[i]);
                        } else {
                            sum += r.coneHits[i].cones;
                        }
                    }
                    r.coneHits = tmp;
                    r.cones = sum;
                    //doAudit(auth.role, r._id + ':Removed cones from station #' + station + '. New total: ' + sum, eid);
                } else {
                    var exists = false
                        , sum = 0
                        , tmp = [];
                    for (var i = 0; i < r.coneHits.length; i++) {
                        if (r.coneHits[i].station == (station == 'na' ? 0 : station)) {
                            if (cones > 0) {
                                r.coneHits[i].cones = cones;
                                tmp.push(r.coneHits[i]);
                                sum += cones;
                            }
                            exists = true;
                        }
                        else {
                            tmp.push(r.coneHits[i]);
                            sum += r.coneHits[i].cones;
                        }
                    }
                    r.coneHits = tmp;
                    if (!exists && cones > 0) {
                        console.log('conehit does not exists, ' + station);
                        r.coneHits.push({ cones: cones, station:  (station == 'na' ? 0 : station) });
                        sum += cones;
                    }
                    r.cones = sum;
                    //doAudit(auth.role, r._id + ': Set Station #' + station + ' to ' + cones+' cones. New total: ' + sum, eid);
                }

                r.coneHits.sort(function (a, b) {
                    return a.station < b.station ? -1 : 1;
                });

                var isRerunChanged = r.getsRerun != (penalty == 'rerun');

                // if (!r.isOff && penalty == 'off')
                //     doAudit(auth.role, r._id + ': Set as OFF at station #' + station, eid);
                // else if (!r.getsRerun && penalty == 'rerun')
                //     doAudit(auth.role, r._id + ': Set as RERUN at station #' + station, eid);
                // else if (!r.isDnf && penalty == 'dnf')
                //     doAudit(auth.role, r._id + ': Set as DNF at station #' + station, eid);
             
                r.isOff = penalty == 'off';
                r.getsRerun = penalty == 'rerun';
                r.isDnf = penalty == 'dnf';
                
                if (r.rawTime > 0) {
                    r.totalTime = Math.floor((r.rawTime + (tevent.conePenalty * r.cones)) * 1000) / 1000;
                    r.paxTime = Math.floor((r.totalTime * r.axClass.index * 1000)) / 1000;
                }

                r.save(function (er) {
                    if (er) callback('Error saving cones to run. ' + er);
                    function sendIt(){
                        if (r.status == 'Q') {
                            io.sockets.in(eid + '-' + stream).emit('conesadv', { rid: runId, total: r.cones, coneHits: r.coneHits, penalty: penalty });
                        } else {
                            io.sockets.in(eid + '-runs').emit('addr', r);

                            //    //we must redo the drivers runs and stats
                            //engine.calcRun(r, r.participantId, true, true, true, tevent);
                            engine.finishRun(eid, r, true);
                        }
                    }

                    if (isRerunChanged){
                        engine.renumberParticipantRuns(r.participantId, function(er){
                            sendIt();
                        })
                    }
                    else 
                        sendIt();
                    
                });
            }); // models.event
        } else {
            callback('Run not found.');
        }
    });
}

engine.conesBasic = function(eid, runId, increment, stream, callback){
    models.runs.findOne({ _id: runId, eventId: eid }, function (er, r) {
        if (r) {
            models.events.findById(eid, function(er, tevent){
                var total = r.cones + increment;
                total = (total < 0 ? 0 : total);
                var orig = r.cones;
                //console.log('total: ' + total);
                r.cones = total;
                var time = 0;
                if (r.rawTime > 0){
                    time = Math.floor(r.rawTime + (tevent.conePenalty * r.cones) * 1000) / 1000;
                }
                r.paxTime = Math.floor(time * r.axClass.index * 1000) / 1000;
                
                doAudit(auth.role, runId + ': ' + increment + ' cone. New total: ' + total, eid);
                //only save if it has changed (basically not if they hit a -1 when = 0)
                if (orig != total) {
                    r.save(function (er) {
                        if (er) callback('Error saving cones to run. ' + er);
                        else if (r.status == 'Q') {
                            io.sockets.in(eid + '-' + stream).emit('cones', { rid: runId, total: total });
                            callback();
                        } else {
                            io.sockets.in(eid + '-runs').emit('addr', r);
                            if (!r.isDnf && !r.isOff) {
                                //we must redo the drivers runs and stats
                                models.participants.findOne({ eventId: eid, _id: r.participantId }, function (erp, part) {
                                    //calcRun(r, part._id, true, true, true);
                                    calcRun(r, part._id, true, true, true, tevent);
                                    //TODO above lookup is redundant in calcRun recalcPart
                                });
                            }
                            callback();
                        }
                    });
                }
                else
                    callback();
            });
            
        } else {
            callback('Run not found.')
        }
    });
}

engine.addUnknownToQueue = function(eid, position, callback){
    models.events.findById(eid).select('_id club currentSession currentRunGroup').exec(function (erev, event) {
        //lookup participant 
        if (event && !erev){
            var dp = new models.participants();
            dp.eventId = eid;
            dp.club = event.club;
            
            if (event.currentRunGroup && event.currentRunGroup.name)
                dp.runGroup = event.currentRunGroup;
            else
                dp.runGroup = {name:'', color:'', label:''}
            dp.memberId = null;
            dp.driver = {
                name: 'UNKNOWN DRIVER'
                , firstName: 'UNKNOWN'
                , lastName: 'DRIVER'
                , car:{
                    description:'Unknown'
                    , make:'', model:'', year:0, color:''
                }
                , carNumber:'0XXX'
            }
            dp.checkedIn =false;
            dp.axClass = {name:'___', paxClass:'', index:1}
            dp.station = '';
            dp.workerRole = '';
            dp.isTechd = false;
            dp.paid = false;
            dp.save(function(er){
                if (!er){
                    models.runs.count({ eventId: eid }, function (er1, count) {

                        var r = new models.runs();
                        r.driverRunNumber = 1;
                        r.runNumber = (count + 1);
                        r.memberId = '';
                        r.participantId = dp._id.toString();
                        r.eventId = eid;
                        r.club = dp.club;
                        //part.driver.memberId = part.memberId;
                        r.driver = dp.driver;
                        r.session = event.currentSession;
                        r.axClass = dp.axClass;
                        r.isCompleted = false;
                        r.status = 'Q';
                        r.runGroup = dp.runGroup;
                        r.save(function (er) {
                            if (position == '-1') {
                                io.sockets.in(eid + '-queue').emit('addq', { run: r });
                                console.log('ADDED TO QUEUE');

                                if (callback) callback();
                            }
                            else {
                                //do repositioning
                                models.runs.find({ eventId: eid, status: 'Q' }).sort({ runNumber: 1 }).exec(function (er2, repos) {
                                    var qruns = [];
                                    var newrunpos = 0, newpos = 0, reposfound = false;
                                    //TODO make this async with the .save()'s
                                    for (var i = 0; i < repos.length; i++) {
                                        if (repos[i]._id.toString() == position) {
                                            //insert before
                                            newrunpos = repos[i].runNumber;
                                            newpos = (newrunpos + 1);
                                            repos[i].runNumber = newpos;
                                            repos[i].save();
                                            reposfound = true;
                                            //console.log('pos found: ' + newrunpos + ', ' + newpos);
                                        }
                                        else if (r._id.toString() == repos[i]._id.toString()) {
                                            repos[i].runNumber = newrunpos;
                                            repos[i].save();
                                            //console.log('new queue found: ' + newrunpos);

                                        }
                                        else if (reposfound) {
                                            newpos++;
                                            //console.log('other ' + newpos);
                                            repos[i].runNumber = newpos;
                                            repos[i].save();
                                        }
                                    }
                                    repos.sort(function (a, b) {
                                        return a.runNumber < b.runNumber ? -1 : 1;
                                    });
                                    io.sockets.in(eid + '-queue').emit('initq', repos);
                                    if (callback) callback();
                                });
                            }
                        });
                    });
                }
                else callback('Error occurred: ' + er);
            })


        }
        else callback('Event does not exist.');
    });
}

engine.addQueue = function(eid, memberId, participantId, carNumber, position, callback){

    models.events.findById(eid).select('_id currentSession currentRunGroup uploadResults').exec(function (erev, event) {
        //lookup participant 

        var partQuery = {eventId:eid};
        var runQuery = {eventId:eid, status:'Q'};
        if (participantId && participantId.length > 0){
            partQuery._id = participantId;
            runQuery.participantId = participantId;
        }
        else if (memberId && memberId.length > 0) {
            partQuery.memberId = memberId;
            runQuery.memberId = memberId;
        }
        else {
            partQuery['driver.carNumber'] = carNumber;
            runQuery['driver.carNumber'] = carNumber;
        }
        //{ eventId: eid, "driver.carNumber": carNumber }
        //console.log(partQuery);
        models.participants.findOne(partQuery, function (err, part) {
            if (part) {
                // check if already in queue
                models.runs.find(runQuery).select('_id').exec(function (rr, qrun) {
                    if (qrun.length == 0) {
                        //get next event runNumber
                        models.runs.count({ eventId: eid }, function (er1, count) {

                            var r = new models.runs();
                            r.driverRunNumber = part.totalCountedRuns + 1;
                            r.runNumber = (count + 1);
                            r.memberId = part.memberId;
                            r.participantId = part._id.toString();
                            r.eventId = eid;
                            r.club = part.club;
                            //part.driver.memberId = part.memberId;
                            r.driver = part.driver;
                            r.session = event.currentSession;
                            r.axClass = part.axClass;
                            r.isCompleted = false;
                            r.status = 'Q';
                            r.runGroup = part.runGroup;
                            r.save(function (er) {
                                if (position == '-1') {
                                    io.sockets.in(eid + '-queue').emit('addq', { run: r });
                                    if (event.uploadResults){
                                        olr.update(eid, 'addq', r);
                                    }
                                    console.log('ADDED TO QUEUE');

                                    if (callback) callback();
                                }
                                else {
                                    //do repositioning
                                    models.runs.find({ eventId: eid, status: 'Q' }).sort({ runNumber: 1 }).exec(function (er2, repos) {
                                        var qruns = [];
                                        var newrunpos = 0, newpos = 0, reposfound = false;
                                        //TODO make this async with the .save()'s
                                        for (var i = 0; i < repos.length; i++) {
                                            if (repos[i]._id.toString() == position) {
                                                //insert before
                                                newrunpos = repos[i].runNumber;
                                                newpos = (newrunpos + 1);
                                                repos[i].runNumber = newpos;
                                                repos[i].save();
                                                reposfound = true;
                                                //console.log('pos found: ' + newrunpos + ', ' + newpos);
                                            }
                                            else if (r._id.toString() == repos[i]._id.toString()) {
                                                repos[i].runNumber = newrunpos;
                                                repos[i].save();
                                                //console.log('new queue found: ' + newrunpos);

                                            }
                                            else if (reposfound) {
                                                newpos++;
                                                //console.log('other ' + newpos);
                                                repos[i].runNumber = newpos;
                                                repos[i].save();
                                            }
                                        }
                                        repos.sort(function (a, b) {
                                            return a.runNumber < b.runNumber ? -1 : 1;
                                        });
                                        io.sockets.in(eid + '-queue').emit('initq', repos);
                                        if (event.uploadResults){
                                            olr.update(eid, 'initq', repos);
                                        }
                                        if (callback) callback();
                                    });
                                }
                            });
                        });
                    } else {
                        //console.log('exists in queue already');
                        callback('Already exists in the queue');
                    }
                });
            }
            else {
                callback(carNumber + ' does not exist.');
            }
        });
    });
}

// used for time keeper screen "save and finish run"
engine.finishQueue = function(eid, runId, rawTime, cones, dnf, off, rerun, callback){
    models.runs.findById(runId, function (err, run) {
        if (run) {
            var originalgetsRerun = run.getsRerun;

            models.events.findById(eid).select('_id conePenalty').exec(function (ere, ev) {
                isUpdate = run.status == 'F';
                run.rawTime = rawTime;
                run.cones = cones;
                run.isDnf = dnf;
                run.getsRerun = rerun;
                run.isOff = off;
                run.status = 'F';
                
                var pax = 0, time = 0;

                if (rawTime > 0){
                    time = Math.round((cones * ev.conePenalty + rawTime) * 1000) / 1000;
                    pax = Math.round((time * run.axClass.index * 1000)) / 1000;
                }
                
                //console.log(pax);
                run.totalTime = time;
                run.paxTime = pax;
                run.finishTimestamp = new Date().getTime();
                run.save(function (er) {
                    //console.log('orig: ' + originalgetsRerun + ', new: ' + rerun);
                    if (originalgetsRerun != rerun){
                        // this we need to redo the driver's run #s
                        console.log('rerun status has changed, reorder driver run #s')
                        engine.renumberParticipantRuns(run.participantId, function(er){
                            //TODO handle error 
                            engine.finishRun(eid, run, isUpdate);
                        });
                    }
                    else 
                        engine.finishRun(eid, run, isUpdate);

                });//run.save
            });//model.events.findone
        } //if (run)
    }); //models.runs.findbyid
}


engine.runQuickChange = function(eid, runId, time, cones, penalty, callback){


    models.events.findById(eid).select('_id conePenalty').exec(function(er, ev){
        var totalTime = time + (ev.conePenalty * parseInt(cones));
        console.log(time + ', ' + totalTime);
        models.runs.findById(runId, function(er,run){
            if (er){
                callback('ERROR: ' + er);
            } else if (!run){
                callback('RUN not found')
            } else {
                
                var paxTime = Math.floor(totalTime  * run.axClass.index * 1000) / 1000;

                run.rawTime = time;
                run.paxTime = paxTime;
                run.totalTime = totalTime;
                run.cones = cones;
                run.isDnf = penalty == 'dnf';
                run.isOff = penalty == 'off';
                run.getsRerun = penalty == 'rerun';
                
                run.save(function(er){
                    if (er) {
                        callback('ERROR saving run: ' + er);
                    } else {

                        engine.finishRun(eid, run, true);

                    }
                })
            }
        });
    });
}

//convenience for sending to rm live
engine.registrationUpdate = function(eid, participant, isNew){
    olr.update(eid, 'reg', {participant:participant});
}

engine.syncLiveEvent = function(eid, callback){
    olr.setEvent(eid, function(er){
        callback(er);
    });
}

function updateMemberTotals(callback){
    models.participants.aggregate([
        {$group:{
            _id:'$memberId'
            , eventCount:{$sum:1}
            , runCount:{$sum:'$totalRuns'}
        }}
    ], function(er, aggr){
        for (var i in aggr){
            
            //models.members.update({'_id':aggr[i]._id}, {'$set':{'$totalEvents': aggr[i].eventCount, '$totalRuns': aggr[i].runCount}}, function(er, result){
            models.members.update({'_id':aggr[i]._id}, {'totalEvents': aggr[i].eventCount, 'totalRuns': aggr[i].runCount}, function(er, result){
                //TODO handle error
            });
        }
        if (callback)
            callback();
    });
}

function calcOverallRankings(parts, ttod) {
    var rank = 0, plen = parts.length;
    //determine overall ranking
    parts.sort(function (a, b) {
        var aa = a.bestTime
            , bb = b.bestTime;
        if (aa < bb) return -1;
        if (aa > bb) return 1;
        return 0;
    });

    //BESTTIME
    //now loop through bestTime sorted and update 
    var funFound = false, ladiesFound = false
        , ttodFound = false, mensFound = false
        , prevTime = 0, bestTime = 0
        , dnfs = 0, reruns = 0
        , cones = 0;

    for (var i = 0; i < plen; i++) {
        if (parts[i].totalReruns > reruns){
            reruns = parts[i].totalReruns;
            ttod.reruns.count = parts[i].totalReruns;
            ttod.reruns.driver = parts[i].driver.name;
            ttod.reruns.car = parts[i].driver.car.description;
            ttod.reruns.carNumber = parts[i].driver.carNumber;
        }
        if (parts[i].totalDnfs > dnfs){
            dnfs = parts[i].totalDnfs;
            ttod.dnfs.count = parts[i].totalDnfs;
            ttod.dnfs.driver = parts[i].driver.name;
            ttod.dnfs.car = parts[i].driver.car.description;
            ttod.dnfs.carNumber = parts[i].driver.carNumber;
        }
        if (parts[i].totalCones > cones){
            cones = parts[i].totalCones;
            ttod.coneKiller.count = parts[i].totalCones;
            ttod.coneKiller.driver = parts[i].driver.name;
            ttod.coneKiller.car = parts[i].driver.car.description;
            ttod.coneKiller.carNumber = parts[i].driver.carNumber;
        }
        if (parts[i].bestTime > 0) {
            
            if (!ttodFound) {
                ttod.ttod.time = parts[i].bestTime;
                ttod.ttod.driver = parts[i].driver.name;
                ttod.ttod.car = parts[i].driver.car.description;
                ttod.ttod.carNumber = parts[i].driver.carNumber;
                bestTime = parts[i].bestTime;
                prevTime = parts[i].bestTime;
                ttodFound = true;
            }
            if (!funFound && parts[i].axClass.name == 'FUN') {

                ttod.fun.time = parts[i].bestTime;
                ttod.fun.driver = parts[i].driver.name;
                ttod.fun.car = parts[i].driver.car.description;
                ttod.fun.carNumber = parts[i].driver.carNumber;
                funFound = true;
            }
            //TODO need to change classes to hold the isLadies flag
            if (!ladiesFound && parts[i].axClass.isLadies) {
                ttod.womens.time = parts[i].bestTime;
                ttod.womens.driver = parts[i].driver.name;
                ttod.womens.car = parts[i].driver.car.description;
                ttod.womens.carNumber = parts[i].driver.carNumber;
                ladiesFound = true;
            }
            //TODO need to change classes to hold the isLadies flag
            if (!mensFound && !parts[i].axClass.isLadies) {
                ttod.mens.time = parts[i].bestTime;
                ttod.mens.driver = parts[i].driver.name;
                ttod.mens.car = parts[i].driver.car.description;
                ttod.mens.carNumber = parts[i].driver.carNumber;
                mensFound = true;
            }

            // do differences 
            parts[i].diffOverall = Math.floor((parts[i].bestTime - bestTime) * 1000) / 1000;
            parts[i].diffPrevOverall = Math.floor((parts[i].bestTime - prevTime) * 1000) / 1000;

            rank++;
            parts[i].rankOverall = rank;
            //set prev time to current
            prevTime = parts[i].bestTime;
        } else {
            parts[i].rankOverall = 0;
        }
    }

    return { participants: parts, ttod: ttod };
}


function calcPaxRankings(parts, ttod, season) {
    var points = season.paxPoints
        , minPoints = season.minimumPaxParticipationPoints;
    //determine pax ranking
    parts.sort(function (a, b) {
        var aa = a.bestPaxTime
            , bb = b.bestPaxTime;
        if (aa < bb) return -1;
        if (aa > bb) return 1;
        return 0;
    });


    //now loop through paxtime sorted and update
    var bestTime = 0;
    var prevTime = 0;
    var paxttodFound = false, plen = parts.length, paxRank = 0;

    for (var i = 0; i < plen; i++) {
        if (parts[i].axClass.name.toLowerCase().indexOf('fun') == -1 && parts[i].bestPaxTime > 0) {
            if (!paxttodFound) {

                ttod.pax.time = parts[i].bestPaxTime;
                ttod.pax.driver = parts[i].driver.name;
                ttod.pax.car = parts[i].driver.car.description;
                ttod.pax.carNumber = parts[i].driver.carNumber;
                paxttodFound = true;

                bestTime = parts[i].bestPaxTime;
                prevTime = parts[i].bestPaxTime;
            }

            // do differences 
            parts[i].diffPax = Math.floor((parts[i].bestPaxTime - bestTime) * 1000) / 1000;
            parts[i].diffPrevPax = Math.floor((parts[i].bestPaxTime - prevTime) * 1000) / 1000;

            paxRank++;
            parts[i].rankPax = paxRank;
            var pt = minPoints;
            if (points){
                var ppts = points[paxRank-1];
                if (ppts !== undefined){
                     pt = ppts.points;
                    //console.log('doing points: ' + pt);
                }
            }
            
            parts[i].paxPoints = pt;
            prevTime = parts[i].bestPaxTime;
        }
        else { parts[i].rankPax = 0; }
    }
    return { participants: parts, ttod: ttod };
}

function calcClassRankings(parts, season, calcMethod){
/*
    calcMethod:
    see models.calcMethods for complete official list
    default / null = based on points table
    besttimediffpct = besttime / driver best * 100 rounded to .000
*/
    var groups = {}
        , newparts = []
        , points = season.classPoints
        , minPoints = season.minimumClassParticipationPoints;

    // create class groupings and arrays with each part
    for (var i in parts){
        var gp = parts[i].axClass.paxClass == '' ? parts[i].axClass.name.replace(':','') : parts[i].axClass.paxClass;
        parts[i].groupClass = gp;

        if (groups[gp] === undefined){
            groups[gp] = [];
        }
        groups[gp].push(parts[i]);
    }

    // loop through the groups
    for (var c in groups){
        var usePax = false;
        if (groups[c].length > 0){
            usePax = groups[c][0].axClass.paxClass.length > 0;
        }
        groups[c].sort(function(a,b){
            if (usePax){
                return a.bestPaxTime > b.bestPaxTime ? 1 : -1;
            } else 
                return a.bestTime > b.bestTime ? 1 : -1;
        });

        var rank = 1, classBest = -1, prevTime = 0;
        for (var i=0;i<groups[c].length;i++){
            if (groups[c][i].bestTime > 0){
                var time = usePax ? groups[c][i].bestPaxTime : groups[c][i].bestTime;
                if (classBest == -1){
                    classBest = time;
                    prevTime = time;
                }
                groups[c][i].rankClass = rank;
                groups[c][i].diffClass = Math.floor((time - classBest) * 1000) / 1000;
                groups[c][i].diffPrevClass = Math.floor((time - prevTime) * 1000) / 1000;
                var pt = minPoints;
                if (calcMethod && calcMethod == 'besttimediffpct'){
                    pt = Math.floor((classBest / time * 1000 ) * 1000) / 1000;
                }
                else {
                    if (points){
                        var ppts = points[rank-1];
                        if (ppts !== undefined){
                             pt = ppts.points;
                            //console.log('doing points: ' + pt);
                        }
                    }
                }
                    
                groups[c][i].classPoints = pt;
                prevTime = time;
                rank++;
            }
            else {
                groups[c][i].rankClass = 0;
                groups[c][i].diffClass = 0;
                groups[c][i].diffPrevClass = 0;
                groups[c][i].classPoints = 0;
            }
            newparts.push(groups[c][i]);
        }

    }

    return {participants:newparts}


}

function calcClassRankingsOLD(parts, points, axclass) {
	for (var i in parts){
    	parts[i].groupClass = parts[i].axClass.paxClass == '' ? parts[i].axClass.name : parts[i].axClass.paxClass;

    }
    // do class rankings
    parts.sort(function (a, b) {

    	return a.axClass.groupClass == b.axClass.groupClass ? 0
    		: a.axClass.groupClass < b.axClass.groupClass ? -1 : 1;
    	// if (a.axClass.paxClass == b.axClass.paxClass) {
    	// 	return a.axClass.name < b.axClass.name ? -1 : a.axClass.name > b.axClass.name ? 1 : 0;
    	// }
    	// return a.axClass.paxClass < b.axClass.paxClass ? -1 : 1;
        // var aa = a.axClass.name
        //     , bb = b.axClass.name;
        // if (aa < bb) return -1;
        // if (aa > bb) return 1;
        // return 0;
    });
    // for (var i in parts){
    // 	console.log(parts[i].axClass.groupClass + ' : ' + parts[i].axClass.paxClass + ' : ' + parts[i].axClass.name);
    // }
    //now loop through and piece out the classes to sort and update
    //TODO put the sub ranking into function
    var cls = {}, clssub = [], plen = parts.length;

    for (var i = 0; i < plen; i++) {
        if (cls.groupClass != parts[i].axClass.groupClass) {
            if (clssub.length > 0) {
            	var usePax = false;
                if (cls.paxClass != undefined)
                    usePax = cls.paxClass.length > 0;
                clssub.sort(function (a, b) {

                    var aa = a.bestTime
                        , bb = b.bestTime;
                    if (usePax){
                    	aa = a.bestPaxTime;
                    	bb = b.bestPaxTime;
                    }
                    if (aa < bb) return -1;
                    if (aa > bb) return 1;
                    return 0;
                });
                classRank = 1;
                var bestc = 0, bestcp = 0;
                var first = true;
                for (var a = 0; a < clssub.length; a++) {

                    if (first) {
                        if (clssub[a].bestTime > 0) {
                            bestc = usePax ? clssub[0].bestPaxTime : clssub[0].bestTime;
                            bestcp = usePax ? clssub[0].bestPaxTime : clssub[0].bestTime;
                            first = false;
                        }
                    }
                    for (var p = 0; p < plen; p++) {
                        if (clssub[a]._id == parts[p]._id) {
                            if (clssub[a].bestTime > 0) {
                                parts[p].rankClass = classRank;
                                var pt = 0;
                                if (points){
                                    var ppts = points[classRank-1];
                                    if (ppts !== undefined){
                                         pt = ppts.points;
                                        //console.log('doing points: ' + pt);
                                    }
                                }
                                parts[p].classPoints = pt;
                                parts[p].diffClass = Math.floor(((usePax ? parts[p].bestPaxTime : parts[p].bestTime) - bestc) * 1000) / 1000;
                                parts[p].diffPrevClass = Math.floor(((usePax ? parts[p].bestPaxTime : parts[p].bestTime) - bestcp) * 1000) / 1000;
                                //bestcp = (usePax ? parts[p].bestPaxTime : parts[p].bestTime);

                                classRank++;
                            }
                            else {
                                parts[p].rankClass = 0;
                            }
                            break;
                        }
                    }

                }
                clssub = [];
            }
            cls = parts[i].axClass;

        } // if groupClass
        
        clssub.push(parts[i]);
    }

    //do it one last time for the remaining sub classes found
    if (clssub.length > 0) {
    	var usePax = false;
        if (cls.paxClass != undefined)
            usePax = cls.paxClass.length > 0;
        clssub.sort(function (a, b) {

            var aa = a.bestTime
                , bb = b.bestTime;
            if (usePax){
            	aa = a.bestPaxTime;
            	bb = b.bestPaxTime;
            }
            if (aa < bb) return -1;
            if (aa > bb) return 1;
            return 0;
        });
        classRank = 1;
        var bestc = 0, bestcp = 0;
        var first = true;
        for (var a = 0; a < clssub.length; a++) {

            if (first) {
                if (clssub[a].bestTime > 0) {
                    bestc = usePax ? clssub[0].bestPaxTime : clssub[0].bestTime;
                    bestcp = usePax ? clssub[0].bestPaxTime : clssub[0].bestTime;
                    first = false;
                }
            }
            for (var p = 0; p < plen; p++) {
                if (clssub[a]._id == parts[p]._id) {
                    if (clssub[a].bestTime > 0) {
                        parts[p].rankClass = classRank;
                        var pt = 0;
                        if (points){
                            var ppts = points[classRank-1];
                            if (ppts !== undefined){
                                 pt = ppts.points;
                                //console.log('doing points: ' + pt);
                            }
                        }
                        parts[p].classPoints = pt;
                        parts[p].diffClass = Math.floor(((usePax ? parts[p].bestPaxTime : parts[p].bestTime) - bestc) * 1000) / 1000;
                        parts[p].diffPrevClass = Math.floor(((usePax ? parts[p].bestPaxTime : parts[p].bestTime) - bestcp) * 1000) / 1000;
                        //bestcp = (usePax ? parts[p].bestPaxTime : parts[p].bestTime);

                        classRank++;
                    }
                    else {
                        parts[p].rankClass = 0;
                    }
                    break;
                }
            }

        }
        clssub = [];
    }

    return { participants: parts };
}
function calcClassRankings2(parts, points, axclass) {
    //first sort by class,bestTime
    //TODO must to subclassing breakout to sort by paxtime or besttime depending upon 
    parts.sort(function (a, b) {
        if (a.axClass.name.split('-')[0] == b.axClass.name.split('-')[0])
            return a.bestPaxTime < b.bestPaxTime ? -1 : 1;
        else
            return a.axClass.name < b.axClass.name ? -1 : 1;
    });

    var cls = ''
        , bestTime = 99999
        , rank = 1
        , isPaxClass = false;

    for (var i = 0; i < parts.length; i++) {
        if (parts[i].bestPaxTime > 0) {
            if (cls != parts[i].axClass.name.split('-')[0]) {
                bestTime = parts[i].bestPaxTime;
                bestTimePrev = parts[i].bestPaxTime;
                cls = parts[i].axClass.name.split('-')[0];
                rank = 1;
                isPaxClass = parts[i].axClass.name.split('-').length > 1;
            }
            parts[i].rankClass = rank;
            var pt = 0;
            if (points){
                var ppts = points[rank-1];
                if (ppts !== undefined){
                     pt = ppts.points;
                    //console.log('setting class points: ' + pt);
                }
               
            }
            parts[i].classPoints = pt;

           	//TODO fix this to be either pax or best depending on paxclass
            parts[i].diffClass = Math.floor((parts[i].bestTime - bestTime) * 1000) / 1000;
            parts[i].diffPrevClass = Math.floor((parts[i].bestTime - bestTimePrev) * 1000) / 1000;
            bestTimePrev = parts[i].bestTime;
            rank++;
        }
    }
    return { participants: parts };
}

// var perfname = '_perf-' + new Date().getHours() + '-' + new Date().getMinutes() + '-' + new Date().getSeconds() + '.txt'
// function savePerf(j){
//     //fs.appendFile(perfname, JSON.stringify(j)+'\n');
// }

function finishRun(eid, run, isUpdate, callback) {
    var bestTimeImproved = false, bestPaxImproved = false;
    //data = {rid, time, cones, dnf, off, rerun}
    // var perf = new perfo();
    // perf.source = 'finishRun';
    console.log('ENGINE: finishRun ' + isUpdate);
    models.events.findOne({ _id: eid }).select('maxRunsPerDriver totalRuns club.id season uploadResults conePenalty').exec(function (ere, ev) {
        
        var maxRuns = ev.maxRunsPerDriver;
        if (!isUpdate) {
            ev.totalRuns = ev.totalRuns + 1;
            ev.save();
            //TODO update this in delete run as well
        }

        //now update participant
        models.participants.findById(run.participantId, function (err, part) {

            if (part) {
                var origpart = { _id: part._id.toString(), driver: { name: part.driver.name }, rankOverall: part.rankOverall, rankClass: part.rankClass, rankPax: part.rankPax, bestTime: part.bestTime, bestPaxTime: part.bestPaxTime };
                //console.log('part found');
                //if (!data.dnf && !data.rerun && !data.off && data.time > 0) {
                run.rankOverall = origpart.rankOverall;
                run.rankClass = origpart.rankClass;
                run.rankPax = origpart.rankPax;
                run.rankOverallChange = 0;
                run.rankClassChange = 0;
                run.rankPaxChange = 0;
                run.save(function(er){
                    if (er) console.log('ERROR SAVING RUN rankings')
                });

                if (((part.totalCountedRuns + 1) <= maxRuns || maxRuns == 0) && !isUpdate) {
                    if (!run.isDnf && !run.getsRerun && !run.isOff && run.rawTime > 0) {
                        part.totalCones += run.cones;
                        if ((part.bestTime > 0 && run.totalTime < part.bestTime) || part.bestTime == 0) {
                            part.bestTime = run.totalTime;
                            //TODO remove this and use computeFinalTime()
                            part.finalTime = run.totalTime;
                            run.timeOffBest = origpart.bestTime - run.totalTime;
                            bestTimeImproved = true;
                        }
                        if ((part.bestPaxTime > 0 && run.paxTime < part.bestPaxTime) || part.bestPaxTime == 0) {
                            part.bestPaxTime = run.paxTime;
                            //TODO remove this and use computeFinalTime()
                            part.finalPaxTime = run.paxTime;
                            run.timeOffPax = origpart.bestPaxTime - run.paxTime;
                            bestPaxImproved = true;
                        }
                        part.totalCountedRuns++;

                        if (bestTimeImproved || bestPaxImproved){

                        }

                    }
                    //DNFs we still add to counted but don't count towards best times above
                    if (run.isDnf || run.isOff) {
                    	part.totalCountedRuns++;
                    }
                    finish();
                } else if (isUpdate) {
                    // recalc the time off best for run
                    timeoffbest();
                }
                
                function timeoffbest(){
                	models.runs.findOne({participantId: run.participantId, eventId: run.eventId, isDnf: false, getsRerun: false, isOff: false, status: 'F'})
                	.where('driverRunNumber').lt(run.driverRunNumber)
                	.sort({driverRunNumber: -1})
                	.select('totalTime paxTime')
                	.exec(function(er, orun){
                		if (!er && orun){
                			if (orun.totalTime > run.totalTime) {
                				// driver improved
                				run.timeOffBest = orun.totalTime - run.totalTime;
                				run.timeOffPax = orun.paxTime - run.paxTime;
                				bestTimeImproved = true;
                				bestPaxImproved = true;
                				part.bestTime = run.totalTime;
                				part.finalTime = run.totalTime;
                				run.save();
                			}
                		}
                		finish();
                	});
                }

                function finish(){
                    part.totalDnfs += run.isDnf ? 1 : 0;
					part.totalReruns += run.getsRerun ? 1 : 0;
					part.totalRuns = part.totalRuns + 1;

					part.save(function (er2) {
					    // send out update before stats processing
					    io.sockets.in(eid + '-queue').emit('delq', run._id);
					    io.sockets.in(eid + '-runs').emit('addr', run);
					    //console.log('paxi: ' + bestPaxImproved + ', timei: ' + bestTimeImproved + ', upd: ' + isUpdate);
					    //no improvement? just send update for part
					    if (!bestPaxImproved && !bestTimeImproved && !isUpdate) {
					        //console.log('UPDATE Only');
					        
					        io.sockets.in(eid + '-results').emit('results', { type: 'update', participants: [part], ttods: null });
					        if (ev.uploadResults){
					            olr.update(eid, 'newrun', {participant:part, run:run, changes:[]});    
					        }
					        

					        //console.log('finishRun() duration ' + (new Date().getTime() - perfStart) + 'ms');
					        // perf.finishEnd = new Date().getTime();
					        // perf.finishDuration = perf.finishEnd - perf.start;
					        // perf.end = perf.finishEnd;
					        // perf.endDuration = perf.finishEnd - perf.start;
					        // savePerf(perf);
					    }
					    else {

					        // perf.finishEnd = new Date().getTime();
					        // perf.finishDuration = perf.finishEnd - perf.start;
					        
					        //console.log('do calcRun');
					        calcRun(run, origpart._id, isUpdate ? true : bestTimeImproved, isUpdate ? true : bestPaxImproved, isUpdate, ev, false, null);
					    }
					});
                }
                


            } else {
                console.log('part not found');
                if (callback) callback('Participant not found.');
                //TODO log error
            }
        }); //models.parts
    });
}
function calcRun(run, origpartId, bestImproved, paxImproved, recalcPart, tevent, isDelete, perf) {
    var eid = run.eventId
        , origparts = []
        , origttod = null
        , changedparts = []
        ;
    console.log('calcrun');
    var start = new Date().getTime(), audit = [];
    // if (perf)
    //     perf.result = 'calc';
    if (recalcPart) {
        //if (perf) perf.result = 'recalc';
        recalcParticipant(origpartId, tevent.maxRunsPerDriver, function(er, newpartrecord){
            doit();
        })
    } else {
        doit();
    }

    function doit() {
        var newParticipantData = null;
        models.participants.find({ eventId: eid }).sort({ _id: 1 }).exec(function (err, pts) {
            audit.push('parts'); audit.push(new Date().getTime() - start);
            if (pts.length > 0) {
                for (var pp in pts) {
                    origparts.push({ _id: pts[pp]._id, driver: { name: pts[pp].driver.name }, rankOverall: pts[pp].rankOverall, rankClass: pts[pp].rankClass, rankPax: pts[pp].rankPax, bestTime: pts[pp].bestTime, bestPaxTime: pts[pp].bestPaxTime });
                }
                audit.push('opart loop'); audit.push(new Date().getTime() - start);
                models.ttods.findOne({ eventId: eid }, function (errrr, ttod) {
                	models.seasons.findOne({clubId:tevent.club.id, seasonYear:tevent.season}, function(er, season){
                        if (er){
                            console.log('ERROR: getting season doit(). ' + er)
                        }
                        else {

                    		audit.push('ttod fectch'); audit.push(new Date().getTime() - start);
    	                    if (!ttod) {
    	                        ttod = new models.ttods();
    	                        ttod.eventId = eid;
    	                    }

    	                    if (bestImproved) {
    	                        //console.log('best improved');
    	                        //TODO get rid of the assigned pts each time, no need
    	                        var bret = calcOverallRankings(pts, ttod);
    	                        pts = bret.participants;
    	                        ttod = bret.ttod;
    	                        audit.push('overall'); audit.push(new Date().getTime() - start);
    	                        var classToCalc = run.axClass.name.split('-')[0];
    	                        var cret = calcClassRankings(pts, season, season.classPointsCalcMethod);
    	                        pts = cret.participants;
    	                        audit.push('class'); audit.push(new Date().getTime() - start);
    	                    }

    	                    if (paxImproved) {
    	                        //console.log('pax improved');
    	                        var pret = calcPaxRankings(pts, ttod, season);
    	                        pts = pret.participants;
    	                        ttod = pret.ttod;
    	                        audit.push('pax'); audit.push(new Date().getTime() - start);
    	                    }


    	                    // save ttod
    	                    //TODO do diff on ttod/orig and send changes
    	                    ttod.save(function (ert) {

    	                    });

    	                    //determine parts changes
    	                    //first sort updated parts to match orig
    	                    pts.sort(function (a, b) {
    	                        var aa = a._id
    	                            , bb = b._id;
    	                        if (aa < bb) return -1;
    	                        if (aa > bb) return 1;
    	                        return 0;
    	                    });

    	                    //console.log('do changes detect');
    	                    //now loop through and compare
    	                    var changes = [];
    	                    //console.log('driver changed' + origpart._id);
    	                    for (var i = 0; i < pts.length; i++) {
    	                        var o = origparts[i];
    	                        var p = pts[i];

                                if (p._id.toString() == run.participantId.toString()){
                                    newParticipantData = p;
                                    run.rankOverall = p.rankOverall;
                                    run.rankClass = p.rankClass;
                                    run.rankPax = p.rankPax;
                                    run.rankOverallChange = p.rankOverall - o.rankOverall;
                                    run.rankClassChange = p.rankClass - o.rankClass;
                                    run.rankPaxChange = p.rankPax - o.rankPax;
                                    run.save();
                                }
    	                        
                                if (o._id == p._id) {
    	                            if (p._id.toString() == origpartId.toString()) {

    	                                changes.push(p);
    	                                //TODO figure out how to make all this async
    	                                //pts[i].save();
    	                                p.save();
    	                            }
    	                                //TODO should we include best/pax time
    	                            else if (o.rankOverall != p.rankOverall ||
    	                                o.rankClass != p.rankClass ||
    	                                o.rankPax != p.rankPax) {
    	                                changes.push(p);
    	                                //console.log('changed detected ' + p.driver.name);
    	                                //TODO figure out how to make all this async or intelligent to rollback ui if failed
    	                                pts[i].save();
    	                            }
    	                        }
    	                        else { console.log('change detect: parts order does not match'); }

    	                    }

    	                    audit.push('detect'); audit.push(new Date().getTime() - start);
    	                    io.sockets.in(eid + '-results').emit('results', { type: 'incr', participants: changes, ttods: ttod });
                            console.log(tevent.uploadResults);
                            if (tevent.uploadResults){
                            	console.log('upload');
                                olr.update(eid, isDelete ? 'delrun' : 'newrun', {participant:newParticipantData, run:run, changes:changes});    
                            }
                            
    	                    
    	                    // recalc leaderboard for event
    	                    // leaderboard.calcEvent(models, eid, function(er, lb){
    	                    //     //TODO emit leaderboard changes
    	                    // });
                            // if (perf){
                            //     perf.changeCount = changes.length;
                            //     perf.end = new Date().getTime();
                            //     perf.endDuration = perf.end - perf.start;
                            //     savePerf(perf);
                            // }
                                
    	                    var auditor = new models.audit();
    	                    auditor.date = new Date();
    	                    auditor.source = 'processtime'
    	                    auditor.eventId = eid;
    	                    var stop = new Date().getTime();
    	                    auditor.description = 'processed ' + changes.length + ' changes & ' + pts.length + ' drivers in ' + (stop - start) + ' ms. :: ' + audit.join(',');
    	                    auditor.save(function (er) { });
    	                    console.log('calc run finished in ' + (stop - start) + ' ms');
                            
                        }
                	});
                }); //models.ttods

            }
        });
    }
}


function recalcEventStats(eventId, season, participants, callback) {
    console.log('recalcEventStats');
    var start = new Date().getTime();
    var toriglist = [];

    models.ttods.findOne({ eventId: eventId }, function (er, ttod) {
        if (!ttod) {
            ttod = new models.ttods();
            ttod.eventId = eventId;
        }
        var nttod = ttod;
            
        var ret = calcOverallRankings(participants, nttod);
        //pax
        console.log('post overall, ret.parts.len: ' + ret.participants.length);
        ret = calcPaxRankings(ret.participants, ret.ttod, season);

        console.log('post pax: ret.parts.len: ' + ret.participants.length);
        //TODO convert to async
        ret.ttod.save();

        //class
        ret = calcClassRankings(ret.participants, season, season.classPointsCalcMethod);
        console.log('port class, ret.parts.len: ' + ret.participants.length);

        toriglist = ret.participants.slice(0);
        var tuselist = ret.participants.slice(0);

        function savepart() {
            
            var p = tuselist.shift();
            if (p === undefined) {
                console.log('finished recalcEventStats in ' + (new Date().getTime() - start) + 'ms');
                console.log('ret.parts: ' + toriglist.length);   
                callback(null, ret.participants, ret.ttod);
            } else {
                p.save(function (er) {
                    //TODO handle error
                    savepart();
                });
            }
            
        }
        savepart();
         
    });
}



function recalcEvent(eventId, callback){
    console.log('Recalc Event:' + eventId);

    var start = new Date().getTime()
        , season = null
        , _event = null
        , toriglist = null
        , partList = []
        , updatedPartList = []
        , runs = []
        , conePenalty = 1
        , isLive = false
        , eventMaxRuns = 0
        ;


    //recalulate all runs
    function step0(){
        var run = runs.shift();
        if (run !== undefined){
            if (run.rawTime > 0) {
                run.totalTime = run.rawTime + (run.cones * conePenalty);
                run.paxTime = Math.floor(run.totalTime * run.axClass.index * 1000) / 1000;
            }
            else
                run.totalTime = 0;

            run.save(function(er){
                //TODO handle er
                
            });
            step0();
        } else {
            console.log('processed all runs in ' + (new Date().getTime() - start) + 'ms');
            start = new Date().getTime();
            step1();
        }
    }

    // step 1 recalc participant data
    function step1() {
        var part = partList.shift();
        if (part){
            recalcParticipantRecord(part, eventMaxRuns, function(er, newpart){
                //TODO error trapping and sending down the line
                updatedPartList.push(newpart);
                step1();
            })
        } else {
            //step2();
            console.log('processed all participants in ' + (new Date().getTime() - start) + 'ms');
            recalcEventStats(eventId, season, updatedPartList, function(er, newparts, newttod){
                //TODO handle error
                leaderboard.calcEvent(_event, _event.eventNumber, season, null, function(er, lb){
                    if (er) console.log('leaderboard calcEvent error: ' + er);
                    updateMemberTotals(function(){
                        if (isLive)
                            io.sockets.in(eventId + '-results').emit('results', { type: 'full', participants: newparts, ttods: newttod });
                        console.log('recalc event finished.')
                        if (callback) callback(er,lb);
                    });
                } )
                // leaderboard.calcEvent(models, eventId, function(er, lb){
                //     if (er) console.log('leaderboard calcEvent error: ' + er);
                //     updateMemberTotals(function(){

                //         io.sockets.in(eventId + '-results').emit('results', { type: 'full', participants: newparts, ttods: newttod });

                //         if (callback) callback(er,lb);
                //     });
                    
                // })
            })
        }
    }


    models.participants.find({ eventId: eventId }, function (er, parts) {
        partList = parts;
        console.log('Participants: ' + parts.length);
        models.events.findById(eventId).select('maxRunsPerDriver totalRuns club.id season conePenalty eventNumber').exec(function(er, evt){
            if (er) console.log('recalcEvent error finding event');
            _event = evt;
            isLive = _event.date == Date.today().toFormat('MM/DD/YYYY');
            console.log('event is live: ' + isLive);

            eventMaxRuns = _event.maxRunsPerDriver;
            conePenalty = _event.conePenalty;
            
            models.seasons.findOne({clubId: _event.club.id, seasonYear:_event.season }, function(er,sn){
                if (er) console.log('recalcEvent error finding season');
                //console.log(sn);
                season = sn;
                models.runs.find({eventId:eventId}, function(er, rns){
                    console.log('Runs: ' + rns.length);
                    runs = rns;

                    _event.participantCount = parts.length;
                    _event.totalRuns = rns.length;
                    _event.save(function(er){
                        step0();
                    });
                });
            });
        });
    });
}


// redo the driver's run number when run marked as rerun (or unmarked) or a run is deleted.
function renumberParticipantRuns(partId, callback){
    models.runs.find({ participantId: partId}).sort({runNumber:1}).exec(function (er, runs) {
        if (er) callback('ERROR getting participant data: ' + er);
        else {
            var driverRunNumber = 1;
            var changedRecords = [];
            function doRun(){
                var run = runs.shift();
                if (run !== undefined){
                    if (run.driverRunNumber != driverRunNumber){
                        changedRecords.push(run);
                        run.driverRunNumber = driverRunNumber;
                        run.save(function(er){
                            //TODO handle errors better
                            if (er) console.log('Error saving run record during run # update. ' + er);
                            if (!run.getsRerun)
                                driverRunNumber++;
                            doRun();
                        })
                    }
                    else {
                        if (!run.getsRerun)
                            driverRunNumber++;

                        doRun();
                    }
                }
                else {
                    callback(null);
                }
            }
            doRun();
        }
    });
}

function recalcParticipantRecord(part, maxRuns, callback){
    models.runs.find({ participantId: part._id.toString(), 'status':'F' }, function (er, runs) {
        if (er) callback('ERROR getting participant data: ' + er);
        else {
            part.totalCones = 0;
            part.bestTime = 0;
            part.bestPaxTime = 0;
            part.totalRuns = 0;
            part.totalCountedRuns = 0;
            part.totalDnfs = 0;
            part.totalReruns = 0;
            part.finalTime = 0;
            part.finalPaxTime = 0;
            if (runs.length > 0){
                var ttlcones = 0;
                for (var rix in runs) {
                    var run = runs[rix];
                    part.totalRuns++;
                    if (!run.getsRerun) part.totalCountedRuns++;
                    part.totalCones += runs[rix].cones;
                    if (!run.isDnf && !run.getsRerun && !run.isOff && run.rawTime > 0 && (maxRuns >= part.totalCountedRuns || maxRuns == 0)) {
                        if ((part.bestTime > 0 && run.totalTime < part.bestTime) || part.bestTime == 0) {
                            part.bestTime = run.totalTime;
                            part.finalTime = run.totalTime;
                        }
                        if ((part.bestPaxTime > 0 && run.paxTime < part.bestPaxTime) || part.bestPaxTime == 0) {
                            part.bestPaxTime = run.paxTime;
                            part.finalPaxTime = run.paxTime;
                        }
                    }
                    if (run.isDnf) part.totalDnfs++;
                    if (run.getsRerun) part.totalReruns++;
                }
            }
            
            part.save(function(er){
                callback(er ? ('ERROR saving participant: ' + er) : null, part);
            });
        }
    });
}

function recalcParticipant(participantId, maxRunsPerDriver, callback){
    
    models.participants.findById(participantId, function(er, part){
        if (er) callback('ERROR getting participant data: ' + er);
        else if (part == null){
            callback('Participant not found.');
        }
        else {
            recalcParticipantRecord(part, maxRunsPerDriver, function(er, newpart){
                callback(er ? er : null, newpart);
            })
        }
    })
        
}

engine.finishRun = finishRun;
engine.calcRun = calcRun;
engine.recalcEvent = recalcEvent;
engine.resetFinish = resetFinish;
engine.recalcParticipant = recalcParticipant;
engine.recalcParticipantRecord = recalcParticipantRecord;
engine.renumberParticipantRuns = renumberParticipantRuns;

module.exports = function(_config){
	models = _config.models;
	io = _config.io;
    hardware = _config.hardware;

    leaderboard = require('./leaderboard2')({models:models});
    olr = require('./olr')({models:models, io:_config.io});
	return engine;
}
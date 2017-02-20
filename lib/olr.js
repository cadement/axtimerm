
var settings = require('../settings')
	, request = require('request')
	, zlib = require('zlib')
	, io = {};


var config = {
	cloudKey:settings.cloudKey
	, rmLiveUrl:'http://live.axti.me'
	, debug: true
	, requestTimeoutSecs: 20
}

var models = {};
var metrics = []; // {type:'newrun', duration, status: er || null}

var uploadedKbs = 0;

if (process.env.NODE_ENV == 'dev'){
	config.rmLiveUrl = 'http://localhost:3000';
}

/*
	type:
		newrun
		editrun
		delrun
		newreg
		editreg


*/

function queueItem(r){

	return {id:r._id.toString(), participantId: r.participantId, driver:r.driver, axClass:r.axClass, runNumber: r.runNumber, driverRunNumber:r.driverRunNumber}
}

function getFullEvent(eid, callback){
	models.events.findById(eid, function(er,ev){
		if (ev){
			//if (ev.uploadResults){
				var data = {
					id:ev._id.toString()
					, location: ev.location.name
					, dateInt: ev.dateInt
					, eventNumber: ev.eventNumber
					, season: ev.season
					, participants:[]
					, runs: []
					, queue: []
				}
				models.participants.find({eventId: eid}, function(er, parts){
					for (var i = 0; i < parts.length; i++) {
						var p = parts[i];
						//console.log(p._id.toString());
						var np = p.toJSON();
						np.id = p._id.toString();
						delete np._id;
						np.eventId = p.eventId.toString();
						np.memberId = p.memberId ? p.memberId.toString() : '';
						
						data.participants.push(np);
					};
					models.runs.find({eventId:eid}).sort({runNumber:1}).exec(function(er, runs){
						var queue = [];
						for (var i = 0; i < runs.length; i++) {

							var r = runs[i];
							if (r.status === 'F'){
								var nr = {};
								nr.id = r._id.toString();
								nr.eventId = eid;
								nr.driver = {
									name:r.driver.name
									, carNumber:r.driver.carNumber 
									, car: r.driver.car.description
								};
								nr.axClass = r.axClass;
								nr.participantId = r.participantId.toString();
								nr.runNumber = r.runNumber;
								nr.driverRunNumber = r.driverRunNumber;
								nr.session = r.session;
								nr.rawTime = r.rawTime;
								nr.totalTime = r.totalTime;
								nr.paxTime = r.paxTime;
								nr.cones = r.cones;
								nr.isDnf = r.isDnf;
								nr.getsRerun = r.getsRerun;
								nr.isOff = r.isOff;
								
								data.runs.push(r);
							}
							else {
								
								data.queue.push(new queueItem(r))
							}

						};

						callback(null, data);
					})
				})
			// }
			// else {
			// 	callback('Upload results is disabled.');
			// }
			
		}
		else {
			callback('No event');
		}
	})
}

function compressData(data, callback){
	var start = new Date().getTime();
	
	var uncompressed = '{}';
	try {
		uncompressed = JSON.stringify(data);
	}
	catch (ex){
		callback('Error during compression.');
		return;
	}

	var len1 = uncompressed.length;
	
	zlib.deflate(uncompressed, function(err, buffer) {
		if (err) console.log('zip error: ' + err);
		//console.log('zip duration: ' + (new Date().getTime() - start) + 'ms');
		var compressed = buffer.toString('base64');
		// console.log(uncompressed);
		// console.log(compressed);
		var len2 = compressed.length;
		uploadedKbs += len2;
		var diff = (1-len2 / len1) * 100;
		console.log('duration: ' + (new Date().getTime() - start) + 'ms, orig: ' + len1 + ', compd: ' + len2 + ', ratio: ' + diff.toFixed(1) + '%');
		console.log('total uploaded: ' + uploadedKbs + ' KBs');
	  	callback(err, !err ?  compressed: null);
	});
}
/*
	task = {type: '', payload:''}
*/


function sendToRmLive(eventId, taskType, compressed, callback){
	var start = new Date().getTime();
	request({
		url : config.rmLiveUrl + '/api/olr?cloudkey=' + config.cloudKey,
		method:'POST',
		timeout:config.requestTimeoutSecs * 1000, // 20 second timeout
		form:{eid: eventId.toString(), data:compressed, type: taskType}
	}, function(er, res, body){
		console.log('sendToRMLive() upload duration: ' + (new Date().getTime() - start) + 'ms');
		if (er) {
			console.log('sendToRmLive Request Error: ' + er);
			//TODO send info to admins
			callback({success:false, noInternet:true, message: 'request error: ' + er});
		}
		else {
			if (res.statusCode && res.statusCode == 200){
				try {
					var result = JSON.parse(body.toString());
					//TODO potential pass back instruction if needed
					//console.log(result);
					if (result.success){
						//console.log('sent to RM Live successful.')
						callback({success:true});
					}
					else if (result.action == 'full'){
						console.log('event does not exist on server, sending full event.')
						callback(result);
					}
					else {
						console.log('sendToRmLive error: ' + result.message);
						callback({success:false, message:result.message	});
					}
				}
				catch (ex){
					callback({success:false, message:'Invalid json returned'});
				}
				
			}
			else {
				console.log(body);
				callback({success:false, message:'bad status code: ' + body});
			}
		}
	}
	);
}

var Queue = function(){
	
	this.eventId = null;
	this.eventCache = null;
	this.items = [];
	this.isProcessing = false;
	this.errorCount = 0;
	this.currentItem = null;
	this.isEmpty = true;
	this.uploadedKbs = 0;

}


Queue.prototype.resync = function(){
	this.errorCount = 0;
	this.items = [];
	this.isProcessing = false;
	
}

Queue.prototype.processItem = function(){
	var self = this;
	console.log('processItem: ' + self.items.length + ' in queue');
	var perfStart = new Date().getTime();
	function perfFin(){
		console.log('.processItem() in ' + (new Date().getTime() - perfStart) + 'ms');
	}
	if (!this.isProcessing){

		this.isProcessing = true;
		var item = this.items.shift();
		if (item !== undefined){
			this.currentItem = item;
			compressData(item.payload, function(er, compressed){
				if (!er){
					sendToRmLive(self.eventId, item.type, compressed, function(res){
						perfFin();
						if (res && res.success){
							if (self.errorCount > 0){
								io.in('admin').emit('adminmsg', 'Synched with RM Live successfully after ' + self.errorCount + ' errors. All good now.');
							}
							self.isProcessing = false;
							self.errorCount = 0;
							self.currentItem = null;
							self.processItem();
						}
						else if (res && res.action == 'full'){
							console.log('rmlive does not have the event, so sending full')
							self.errorCount = 0;
							self.currentItem = null;
							self.setEvent(eventId, function(er){
								//TODO handle error
								self.isProcessing = false;
								self.processItem();
							})
						}
						else {
							
							self.handleError('Error sending data to RM: ' + res.message);
						}
					});
				}
				else {
					//console.log('Compression error: ' + er);
					self.handleError('Compression error: ' + er);
				}
			})
		}
		else {
			this.isProcessing = false;
			//console.log('no more items to process')
		}
	}
	else {console.log('\ttask already processing')}
}

Queue.prototype.handleError = function(msg){
	//TODO handle errors
	var self = this;
	this.errorCount++;
	this.items.unshift(this.currentItem);
	this.isProcessing = false;
	var delay = Math.pow(2, this.errorCount) / 10 * 1000; // delay that number of secs, 
	delay = delay > 60000 ? 60000 : delay;
	//TODO choose when to alert the sys users over socket
	console.log('There was an error in OLR, trying again in ' + delay + 'ms.  Current error count: ' + this.errorCount);
	console.log(msg.red);
	var secs = delay / 1000;
	if (this.errorCount > 4){
		var message = this.errorCount + ' errors in a row synching to RM Live. Next try in ' + secs + ' seconds.';
		if (msg.indexOf('ECONNREFUSED') > -1)
			message = 'Could not connect to RM Live (' + this.errorCount + '). Check your Internet connection. Next try in ' + secs + ' seconds.';

		io.in('admin').emit('adminmsg',message);
	}

	function redo(){
		self.processItem();
	}
	setTimeout(redo, delay);
}



Queue.prototype.add = function(eventId, type, payload){
	//console.log('olr.add');
	var self = this;
	//TODO TAKE THIS OUT FOR PROD
	//self.eventId = eventId;

	if (this.eventId === null || this.eventId != eventId){
		this.items = [];
		getFullEvent(eventId, function(er, data){
			if (!er){
				self.eventId = eventId;
				self.add(eventId, 'full', data);
			}
			else {
				console.log('error getting full event: ' + er);
			}
			
		})
	}
	else {
		//console.log('adding ' + type + ' to rm live queue')
		this.items.push({type:type, payload:payload});
		this.processItem();
	}
		
}

Queue.prototype.setEvent = function(eid, callback){
	//TODO add in cancelling any current process or at least ignore an error
	this.eventId = eid;
	var self = this;
	getFullEvent(eid, function(er, data){
		self.items = [];
		self.add(eid, 'full', data);
		callback(er);
	})
}

Queue.prototype.update = function(eventId, type, data) {
	var payload = null;
	//console.log(eventId);
	//console.log('queue.update');
	if (payloads[type] === undefined){
		console.log('invalid type')
		return {success: false, message:'Invalid type: ' + type};
	}
	else {
		payload = payloads[type](data);
		if (payload === null) return {success:false, message:'Invalid data passed.'}

		this.add(eventId, type, payload);
		return {success:true, message:''}
	}
}




var payloads = {}

// function queueItem(){
	
// }
// data = [runs]
payloads.initq = function(data){
	var payload = {
		eid:data.eid || null
		, action:'initq'
		, q:[]
	}

	for (var i = 0; i < data.length; i++) {
		var q = data[i]
		payload.q.push(new queueItem(q));
	};

	return payload;

}

payloads.addq = function(data){
	var q = data;
	var payload = {
		eid:data.eid || null
		, action:'addq'
		, q:new queueItem(q)
	}

	return payload;
}

payloads.delq = function(data){
	payload = {q:data, action:'delq'};  //data should be run._id

	return payload;
}

payloads.timers = function(data){
	
}

payloads.reg = function(data){
	//TODO handle when applying reg change to existing runs (recalcEvent)
	data.participant.id = data.participant._id.toString();
	return data.participant;
}

payloads.newrun = function(data){

	var payload = {
		eid: data.eid || null
		, action: 'newrun'
		, r:{} // run
		, p:{} // participant
		, c:[] // changes
	}
	//TODO validate
	var p = data.participant || null;
	if (!p) return null;

	payload.p.id = p._id.toString()
	payload.p.finalTime = p.finalTime;
	payload.p.finalPaxTime = p.finalPaxTime;
	payload.p.bestTime = p.bestTime;
	payload.p.bestPaxTime = p.bestPaxTime;
	payload.p.rankOverall = p.rankOverall;
	payload.p.rankClass = p.rankClass;
	payload.p.rankPax = p.rankPax;
	payload.p.diffOverall = p.diffOverall;
	payload.p.diffPax = p.diffPax;
	payload.p.diffClass = p.diffClass;
	payload.p.diffPrevOverall = p.diffPrevOverall;
	payload.p.diffPrevPax = p.diffPrevPax;
	payload.p.diffPrevClass = p.diffPrevClass;
	payload.p.paxPoints = p.paxPoints;
	payload.p.classPoints = p.classPoints;
	payload.p.totalCones = p.totalCones;
	payload.p.totalDnfs = p.totalDnfs;
	payload.p.totalReruns = p.totalReruns;
	payload.p.totalRuns = p.totalRuns;
	payload.p.totalCountedRuns = p.totalCountedRuns;

	var r = data.run;
	if (!r) return null;
	payload.r = r;
	// payload.r = {
	// 	id: r._id.toString()
	// 	, runNumber: r.runNumber
	// 	, driverRunNumber: r.driverRunNumber
	// 	, driverName: r.driver.name
	// 	, driver: {name:r.driver.name
	// 		, carNumber:r.driver.carNumber 
	// 		, car: r.driver.car.description
	// 	}
	// 	, axClass: r.axClass
	// 	, session:r.session
	// 	, rawTime: r.rawTime
	// 	, totalTime: r.totalTime
	// 	, paxTime: r.paxTime
	// 	, cones: r.cones
	// 	, isDnf: r.isDnf
	// 	, isOff: r.isOff 
	// 	, getsRerun: r.getsRerun
	// 	, coneHits: r.coneHits
	// }

	var chg = data.changes;
	if (chg && chg.length > 0) {
		for (var i = 0; i < chg.length; i++) {
			var c = chg[i];
			payload.c.push({
				id:c._id.toString()
				, driverName: c.driver.name 
				, rankOverall:c.rankOverall
				, rankClass:c.rankClass
				, rankPax: c.rankPax
				, diffOverall: c.diffOverall
				, diffPax: c.diffPax
				, diffClass: c.diffClass
				, diffPrevOverall: c.diffPrevOverall
				, diffPrevPax: c.diffPrevPax
				, diffPrevClass: c.diffPrevClass
				, paxPoints:c.paxPoints
				, classPoints: c.classPoints
			});
		};
	}

	return payload;
}

payloads.delrun = function(data){
	var payload = {
		eid: data.eid || null
		, action: 'delrun'
		, r:{} // run
		, p:{} // participant
		, c:[] // changes
	}
	//TODO validate
	var p = data.participant || null;
	if (!p) return null;

	payload.p.id = p._id.toString()
	payload.p.finalTime = p.finalTime;
	payload.p.finalPaxTime = p.finalPaxTime;
	payload.p.bestTime = p.bestTime;
	payload.p.bestPaxTime = p.bestPaxTime;
	payload.p.rankOverall = p.rankOverall;
	payload.p.rankClass = p.rankClass;
	payload.p.rankPax = p.rankPax;
	payload.p.diffOverall = p.diffOverall;
	payload.p.diffPax = p.diffPax;
	payload.p.diffClass = p.diffClass;
	payload.p.diffPrevOverall = p.diffPrevOverall;
	payload.p.diffPrevPax = p.diffPrevPax;
	payload.p.diffPrevClass = p.diffPrevClass;
	payload.p.paxPoints = p.paxPoints;
	payload.p.classPoints = p.classPoints;
	payload.p.totalCones = p.totalCones;
	payload.p.totalDnfs = p.totalDnfs;
	payload.p.totalReruns = p.totalReruns;
	payload.p.totalRuns = p.totalRuns;
	payload.p.totalCountedRuns = p.totalCountedRuns;

	var r = data.run;
	if (!r) return null;
	payload.r = {
		id: r._id.toString()
	}

	var chg = data.changes;
	if (chg && chg.length > 0) {
		for (var i = 0; i < chg.length; i++) {
			var c = chg[i];
			payload.c.push({
				id:c._id.toString()
				, driverName: c.driver.name 
				, rankOverall:c.rankOverall
				, rankClass:c.rankClass
				, rankPax: c.rankPax
				, diffOverall: c.diffOverall
				, diffPax: c.diffPax
				, diffClass: c.diffClass
				, diffPrevOverall: c.diffPrevOverall
				, diffPrevPax: c.diffPrevPax
				, diffPrevClass: c.diffPrevClass
				, paxPoints:c.paxPoints
				, classPoints: c.classPoints
			});
		};
	}

	return payload;
}


// var queue = new Queue();




module.exports = function(cfg){
	models = cfg.models;
	if (cfg.io)
		io = cfg.io;
	//var q = new Queue();
	
	return new Queue();
};
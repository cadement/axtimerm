var request = require('request')
	, fs = require('fs')
	, parseXml = require('xml2js').parseString;


var orgId = null
	, username = null
	, password = null
	;


var urls = {
	events:'http://api.motorsportreg.com/rest/calendars.json'
	, orgevents: 'http://api.motorsportreg.com/rest/calendars/organization/#orgid#.json'
	, reglist:'http://api.motorsportreg.com/rest/events/#event_id#/attendees.json'
	, reglistfull:'http://api.motorsportreg.com/rest/events/#event_id#/assignments.json'
	, members:'http://api.motorsportreg.com/rest/members'
}

function msrGetParticipants(eventId, callback){
	var start = new Date().getTime();
	var responses = 0;
	var success = true;
	var errors = [];
	var list = [];
	var dataset = [null,null];
	function find(id){
		for (var ii in list){
			if (id == list[ii].memberuri){
				return {ix:ii, record:list[ii]};
			}
		}
		return null;
	}
	function handle(er, data, source){
		responses++;
		if (success) {
			if (er) {
				success = false;
				errors.push(er);
			}
			else {
				if (source == 'attendees')
					dataset[0] = data;
				else
					dataset[1] = data;
				
				console.log('duration: ' + (new Date().getTime() - start))
				// if (list.length == 0) {
				// 	list = data;
				// }
				// else {
				// 	for (var i in data){
				// 		var lookup = find(data[i].memberuri);
				// 		if (lookup){
				// 			var el = lookup.record;
				// 			for (var a in data[i]){
				// 				if (a != 'types')
				// 					el[a] = data[i][a];
				// 			}
				// 			el.uid = data[i].memberuri.split('/')[2];
				// 			list[lookup.ix] = el;
				// 		} else {
				// 			list.push(data[i]);
				// 			//console.log('lookup not found: ' + data[i].id);
				// 		}
				// 	}
				// }
			}
		}
		if (responses == 2){
			console.log('all done');
			if (success){
				list = dataset[0];
				
				for (var i in dataset[1]){
					var lookup = find(dataset[1][i].memberuri);
					if (lookup){
						var el = lookup.record;
						for (var a in dataset[1][i]){
							//if (a != 'types')
								el[a] = dataset[1][i][a];
						}
						el.uid = dataset[1][i].memberuri.split('/')[2];
						list[lookup.ix] = el;
					} else {
						//list.push(dataset[1][i]);
						//console.log('lookup not found: ' + data[i].id);
					}
				
				}
				fs.writeFile('_msr_ncc_merged4.txt', JSON.stringify(list));
				callback(null, list);
			} else {
				callback(errors.join(', '));
			}
		}
	}

	attendeesXml(eventId, handle);
	assignmentsXml(eventId, handle);
	
		

}

function assignmentsXml(eventId, cb) {
	var start = new Date().getTime();
	console.log('MSR: Getting assignments. ');
	var url = urls.reglistfull.replace('#event_id#',eventId).replace('.json','');
	request({
		url: url
		, headers:{
			'X-Organization-Id':orgId
		}
		, timeout: 30000
		//, json:true
		, auth:{
			user:username
			, pass:password
			, sendImmediately:true
		}
	}, function(e,r,body){
		if (!e) {
			if (r.statusCode == 200) {

				console.log('received assignments');
				fs.writeFile('_msr_ncc_assignments3.xml', body);
				parseXml(body, function (err, result) {
					var assignmentsar = [];
					//fs.writeFile('msrassignlist.txt', JSON.stringify(result));
				    for (var i in result.response.assignments[0].assignment){
				    	var m = {};
				    	for (var n in result.response.assignments[0].assignment[i]){
				    		m[n] = result.response.assignments[0].assignment[i][n][0];
				    	}
				    	assignmentsar.push(m);
				    }
				    //fs.writeFile('_msr_ncc_assignments3.txt', JSON.stringify(assignmentsar));
					cb(null, assignmentsar,'assignments');
				});
				
				
			}
			else if (r.statusCode == 401){
				console.log('Invalid MSR username and password');
				cb('Invalid MSR username and/or password.');
			}
			else {
				console.log(url);
				console.log('Assignments MSR server reponse code:' + r.statusCode);
				var duration = new Date().getTime() - start;
				console.log('returned in ' + duration + 'ms');
				for (var h in r.headers){
					console.log(h + ': ' + r.headers[h]);
				}
				cb('MSR Server Error: ' + r.statusCode);
			}
				
		}
		else {
			console.log('ERROR: ' + e);
			cb('Reguest Error: ' + e);
		}

		//console.log('duration: ' + (new Date().getTime() - start) + 'ms');

	})
}
function assignments(eventId, cb) {
	var start = new Date().getTime();
	console.log('MSR: Getting assignments. ');
	var url = urls.reglistfull.replace('#event_id#',eventId);
	request({
		url: url
		, headers:{
			'X-Organization-Id':orgId
		}
		, timeout: 30000
		, json:true
		, auth:{
			user:username
			, pass:password
			, sendImmediately:true
		}
	}, function(e,r,body){
		if (!e) {
			if (r.statusCode == 200) {
				console.log('received assignments');
				cb(null, body.response.assignments);
				
			}
			else if (r.statusCode == 401){
				console.log('Invalid MSR username and password');
				cb('Invalid MSR username and/or password.');
			}
			else {
				console.log(url);
				console.log('Assignments MSR server reponse code:' + r.statusCode);
				var duration = new Date().getTime() - start;
				console.log('returned in ' + duration + 'ms');
				for (var h in r.headers){
					console.log(h + ': ' + r.headers[h]);
				}
				cb('MSR Server Error: ' + r.statusCode);
			}
				
		}
		else {
			console.log('ERROR: ' + e);
			cb('Reguest Error: ' + e);
		}

		//console.log('duration: ' + (new Date().getTime() - start) + 'ms');

	})
}



/*******************************************************************

	MSR ATTENDEES API

********************************************************************/


function attendeesXml(eventId, cb) {
	var start = new Date().getTime();
	console.log('MSR: Getting attendees.');
	var url = urls.reglist.replace('#event_id#',eventId).replace('.json','');
	request({
		url: url
		, headers:{
			'X-Organization-Id':orgId
		}
		, timeout:30000
		//, json:true
		, auth:{
			user:username
			, pass:password
			, sendImmediately:true
		}
	}, function(e,r,body){
		if (!e) {
			if (r.statusCode == 200) {
				console.log('attendees received');
				//fs.writeFile('_msr_ncc_attendees3.xml', body);
				parseXml(body,{explicitArray:false}, function (err, result) {
					var assignmentsar = [];
					if (err){
						cb('XML Parse ERROR: ' + err);
					}
					else {
						//fs.writeFile('msrattendeeslist.txt', JSON.stringify(result));
					    for (var i in result.response.attendees.attendee){
					    	var m = {};
					    	for (var n in result.response.attendees.attendee[i]){
					    		m[n] = result.response.attendees.attendee[i][n];
					    	}
					    	assignmentsar.push(m);
					    }
					    //fs.writeFile('_msr_ncc_attendees.txt', JSON.stringify(assignmentsar));
						cb(null, assignmentsar, 'attendees');
					}
						
				});
				var duration = new Date().getTime() - start;
				console.log('attendees returned in ' + duration + 'ms');
				
			}
			else if (r.statusCode == 401){
				console.log('Invalid MSR username and password');
				cb('Invalid MSR username and/or password. ');
			}
			else {
				console.log(url);
				console.log('MSR Attendees server response code:' + r.statusCode);
				var duration = new Date().getTime() - start;
				console.log('returned in ' + duration + 'ms');
				for (var h in r.headers){
					console.log(h + ': ' + r.headers[h]);
				}
				cb('MSR Server Error: ' + r.statusCode);
			}
				
		}
		else {
			console.log('ERROR: ' + e);
			cb('Reguest Error: ' + e);
		}

		//console.log('duration: ' + (new Date().getTime() - start) + 'ms');

	})
}

function attendees(eventId, cb) {
	var start = new Date().getTime();
	console.log('MSR: Getting attendees. ');
	var url = urls.reglist.replace('#event_id#',eventId);
	request({
		url: url
		, headers:{
			'X-Organization-Id':orgId
		}
		, timeout:30000
		, json:true
		, auth:{
			user:username
			, pass:password
			, sendImmediately:true
		}
	}, function(e,r,body){
		if (!e) {
			if (r.statusCode == 200) {
				console.log('attendees received');
				cb(null, body.response.attendees);
				var duration = new Date().getTime() - start;
				console.log('attendees returned in ' + duration + 'ms');
				//fs.writeFile('reglist.txt', JSON.stringify(body));
				// for (var i in body.response.assignments){
				// 	var a = body.response.assignments[i];
				// 	if (i == 0) {
				// 		for (var n in a){
				// 			console.log(n);
				// 		}
				// 	}
				// }
			}
			else if (r.statusCode == 401){
				console.log('Invalid MSR username and password');
				cb('Invalid MSR username and/or password. ');
			}
			else {
				console.log(url);
				console.log('MSR Attendees server response code:' + r.statusCode);
				var duration = new Date().getTime() - start;
				console.log('returned in ' + duration + 'ms');
				for (var h in r.headers){
					console.log(h + ': ' + r.headers[h]);
				}
				cb('MSR Server Error: ' + r.statusCode);
			}
				
		}
		else {
			console.log('ERROR: ' + e);
			cb('Reguest Error: ' + e);
		}

		//console.log('duration: ' + (new Date().getTime() - start) + 'ms');

	})
}

function msrGetMembers(cb){
	var start = new Date().getTime();
	console.log('MSR: Getting members.');
	var url = urls.members;
	request({
		url: url
		, headers:{
			'X-Organization-Id':orgId
		}
		, timeout:30000
		//, json:true
		, auth:{
			user:username
			, pass:password
			, sendImmediately:true
		}
	}, function(e,r,body){
		if (!e) {
			if (r.statusCode == 200) {
				console.log('members received');
				var members = [];
				fs.writeFile('msr-members-xml.txt', body, function(er){
					console.log('done saving msr members downloaded file. ' + er);
				})
				parseXml(body, function (err, result) {
				    //fs.writeFile('msrmemlist.txt', JSON.stringify(result));
				    for (var i in result.response.members[0].member){
				    	var m = {};
				    	for (var n in result.response.members[0].member[i]){
				    		m[n] = result.response.members[0].member[i][n][0];
				    	}
				    	members.push(m);
				    }
				    //fs.writeFile('msrmemlist2.txt', JSON.stringify(members));
				    cb(null, members);
					var duration = new Date().getTime() - start;
				    console.log('get msr members returned in ' + duration + 'ms');
				});
			}
			else if (r.statusCode == 401){
				console.log('Invalid MSR username and password');
				cb('Invalid MSR username and/or password. ');
			}
			else {
				var duration = new Date().getTime() - start;
				console.log('returned in ' + duration + 'ms');
				for (var h in r.headers){
					console.log(h + ': ' + r.headers[h]);
				}
				console.log('MSR Members server response code:' + r.statusCode);
				cb('MSR Server Error: ' + r.statusCode);
			}
				
		}
		else {

			console.log('Members ERROR: ' + e);
			cb('Reguest Error: ' + e);
		}

		//console.log('duration: ' + (new Date().getTime() - start) + 'ms');

	})
}

//reglist('1AB0E497-C85F-333A-B2FF4F91B6919399');

//msrGetParticipants('1AB0E497-C85F-333A-B2FF4F91B6919399');

function msrGetEvents(callback){
	request({
		url:urls.orgevents.replace('#orgid#',orgId)
		, headers:{
			'X-Organization-Id':orgId
		}
		, json:true
		, auth:{
			user:username
			, pass:password
			, sendImmediately:false
		}
	}, function(e,r,body){
		console.log('get events done');
		if (e){
			callback(e);
		}
		else if (r.statusCode != 200){
			console.log('MSR returned error: ' + r.statusCode)
			callback('MSR returned error: ' + r.statusCode);
		}
		else {
			callback(null, body.response.events);
		//fs.writeFile('output.txt', JSON.stringify(body));
		//console.log(body.response.recordset.page);
			// for (var i in body.response.events){
			// //for (var i=0;i<body.response.recordset.events.length;i++){
			// 	var ev =  body.response.events[i];
			// 	console.log(ev.name);
			// 	if (i == 0) {
					
			// 		for (var n in ev){
			// 			console.log(n);
			// 		}
			// 	}
			// }
		}
	});
}



module.exports = function(oid, user, pass) {
	orgId = oid;
	username = user;
	password = pass;

	return {
		getParticipants: msrGetParticipants
		, getEvents: msrGetEvents
		, getMembers: msrGetMembers
	}
}

// module.exports.getParticipants = msrGetParticipants;
// module.exports.getEvents = msrGetEvents;

//showEvents()

var fs = require('fs')
    , utils = require('../utils')
    , models = null
    , engine = null
    , converter = {}
	;

const UNIVERSAL_NEWLINE = /\r\n|\r|\n/g;

function capitalize(s){
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function formatName(s){
    var ss = s.trim().replace('  ',' ');
    var sss = ss.split(' ');
    var result = [];
    for (var i = 0; i < sss.length; i++) {
        if (sss[i].trim().length > 0)
            result.push(capitalize(sss[i]));
    };

    return result.join(' ');
}

function parseCSVLine(s, sep) {
    // http://stackoverflow.com/questions/1155678/javascript-string-newline-character
    var universalNewline = /\r\n|\r|\n/g;
    var a = s.split(universalNewline);
    for (var i in a) {
        for (var f = a[i].split(sep = sep || ","), x = f.length - 1, tl; x >= 0; x--) {
            if (f[x].replace(/"\s+$/, '"').charAt(f[x].length - 1) == '"') {
                if ((tl = f[x].replace(/^\s+"/, '"')).length > 1 && tl.charAt(0) == '"') {
                    f[x] = f[x].replace(/^\s*"|"\s*$/g, '').replace(/""/g, '"');
                } else if (x) {
                    f.splice(x - 1, 2, [f[x - 1], f[x]].join(sep));
                } else f = f.shift().split(sep).concat(f);
            } else f[x].replace(/""/g, '"');
        } a[i] = f;
    }
    return a;
}

function endsWith(str, suffix) {
    return str.indexOf(suffix, str.length - suffix.length) !== -1;
}
function startsWith(str, prefix){
    return str.indexOf(str) == 0;
}
function extractClass(paxClasses, classes, className){
    //console.log('extractClass(' + className + ')');
    var paxExists = false
        , classExists = false
        , result = {
            axClass:''
            , paxClass:''
        };

    // helpers

    function searchClasses(s){
        for (var i=0;i<classes.length;i++){
            if (s.trim().toLowerCase() == classes[i].name.trim().toLowerCase()){
                return classes[i];
            }
        }
        return null;
    }
    function searchPaxClasses(s){
        for (var i=0;i<paxClasses.length;i++){
            if (paxClasses[i].name.trim().toLowerCase() == s.trim().toLowerCase()){
                return paxClasses[i];
            }
        }
        return null;
    }
    function hasPax(s){
        var sn = s.toLowerCase();
        for (var c = 0; c < classes.length; c++) {
            var cls = classes[c];
            var cn = cls.name.toLowerCase();
            for (var p = 0; p < paxClasses.length; p++) {
                var pcls = paxClasses[p];
                var pn = pcls.name.toLowerCase();
                if (cn + pn == sn || pn+cn == sn){
                    var res = copyObj(cls);
                    res.paxClass = pcls.name;
                    res.name = pcls.name + '-' + cls.name;
                    //console.log('Found: ' + res.name);
                    return res;
                }
            };
        };
        console.log(s + ' NOT FOUND');
        return null;
    }
    

    function copyObj(o){
        var r = {}
        for (var n in o){
            if (n != '_id'){
                r[n] = o[n];
            }
        }
        return r;
    }

    // first see if the classes matches a class exactly
    var classObj = searchClasses(className);

    if (classObj !== null) {
        //console.log('Found: ' + classObj.name);
        return copyObj(classObj);
    }
    else {
        // either the class does not exist or it is a pax / class combo
        // now check if it starts or ends with a pax class
        return hasPax(className);
    }
}


function regEntry(){
    return {
        clubMemberId:''
        , msrId:''
        , firstName:''
        , lastName:''
        , axClass:''
        , paxClass:''
        , dedicatedNumber:''
        , dedicatedClass:''
        , dedicatedPaxClass:''
        , carNumber:''
        , car:{
            year:0
            , model:''
            , make:''
            , description:''
            , color:''
        }
        , paid:false
        , paidAmount:0
        , email:''
        , sponsors:[]
        , phone:''
        , importStatus:false
        , message:''
        , memberId:null
        , classObj:null
        , memberObj:null
        , isNewDriver:true

    }
}

//master import function
function importEventRegistration(tevent, regs, _cfg, callback){
    var eid = tevent._id.toString()
        , club = tevent.club
        , participantCount = 0
        , parseAxClassForPax = false
        , errorList = []
        , participantList = [];
    
    if (_cfg !== undefined && _cfg instanceof Object){
        if (_cfg.parseAxClassForPax){
            parseAxClassForPax = true;
        }
    }

    // primary looping function

    function importOne(season, members){

        if (regs.length == 0) {
            tevent.participantCount = participantList.length;
            tevent.save();
            callback(errorList, participantList);
        } else {

            var reg = regs.shift()
                , memberObj = null
                , classes = season.classes
                , paxClasses = season.paxClasses
                , classObj={}
                ;

            function memberLookup(){

                for (var i=0;i<members.length;i++){
                    var m = members[i];
                   if (reg.msrId.length > 0) {
                        if (m.msrId == reg.msrId){
                            return m;
                        }
                    } else if (reg.clubMemberId != undefined && reg.clubMemberId.length > 0){
                        if (m.clubMemberId == reg.clubMemberId
                            && m.lastName.toLowerCase() == reg.lastName.toLowerCase()){
                            return m;
                        }
                    } else if (m.firstName.toLowerCase() == reg.firstName.toLowerCase() 
                        && m.lastName.toLowerCase() == reg.lastName.toLowerCase()){
                        return m
                    }
                }
                return null;
            }
            function lookupClass(ocls, opcls){
                console.log('lookupClass(' + ocls + ',' + opcls);
                var paxExists = false
                    , classExists = false
                    , result = {};
                if (opcls != ''){
                    for (var i=0;i<paxClasses.length;i++){
                        if (paxClasses[i].name.toLowerCase() == opcls.toLowerCase()){
                            paxExists = true;
                            break;
                        }
                    }
                }

                for (var i=0;i<classes.length;i++){
                    if (ocls.toLowerCase() == classes[i].name.toLowerCase()){
                        classExists = true;
                        for (var n in classes[i]){
                            if (n != '_id'){
                                result[n] = classes[i][n];
                            }
                        }
                        break;
                    }
                }

                result.paxClass = opcls;
                if (!classExists && !paxExists)
                    result = null;
                else if (result.paxClass.length > 0 && !classExists)
                    result = null;
                else if (!classExists)
                    result = null;
                else if (result.paxClass.length > 0){
                    result.name = opcls + '-' + ocls;
                }

                return result;
                   
            }
            function parseClass(ocls){
                var classFound = false;
                var result = {}
                    , paxClass = ''
                    , axClass = ocls;

                // first detect if class = an existing class

                for (var i=0;i<classes.length;i++){
                    if (axClass.toLowerCase() == classes[i].name.toLowerCase()){
                        classFound = true;
                        for (var n in classes[i]){
                            if (n != '_id'){
                                result[n] = classes[i][n];
                            }
                        }
                        break;
                    }
                }

                // check if there is a pax class if no class was found
                if (!classFound && paxClass.length > 0){
                    for (var i=0;i<paxClasses.length;i++){
                        if (ocls.toLowerCase().lastIndexOf(paxClasses[i].name.toLowerCase(), 0) === 0){
                            //pax class detected, trim 
                            console.log('pax class detected: ' + ocls);
                            paxClass = paxClasses[i].name;
                            axClass = ocls.substring(paxClass.length);
                        }
                    }

                    for (var i=0;i<classes.length;i++){
                        if (axClass.toLowerCase() == classes[i].name.toLowerCase()){
                            classFound = true;
                            for (var n in classes[i]){
                                if (n != '_id'){
                                    result[n] = classes[i][n];
                                }
                            }
                            break;
                        }
                    }
                }
                    

                result.paxClass = paxClass;
                if (!classFound)
                    result = null;
                else if (paxClass.length > 0){
                    result.name = paxClass + '-' + axClass;
                }

                return result;
            }

            function saveMember(){
                //save car
                //console.log('saving member')
                if (memberObj.cars.length == 0){
                    memberObj.cars = [reg.car];
                    memberObj.dateUpdated = new Date();
                } else {
                    var carExists = false;
                    for (var i=0;i<memberObj.cars.length;i++) {
                        
                        if (memberObj.cars[i].make.toLowerCase() == reg.car.make.toLowerCase()
                            && memberObj.cars[i].model != undefined
                            && memberObj.cars[i].model.toLowerCase() == reg.car.model.toLowerCase()
                            && memberObj.cars[i].year == reg.car.year){
                            carExists = true;
                            break;
                        }
                    }
                    if (!carExists){
                        memberObj.cars.push(reg.car);
                        memberObj.dateUpdated = new Date();
                    }
                }
                memberObj.totalEvents = memberObj.totalEvents + 1;
                memberObj.save(function(er){
                    //memberObj = member;
                    addParticipant();
                })

            }
            function addMember(){
                console.log('adding member: ' + reg.firstName + ', ' + reg.lastName);
                var member = new models.members();
                member.club = {id:club.id, name:club.name}
                member.clubMemberId = reg.clubMemberId;
                member.firstName = reg.firstName;
                member.lastName = reg.lastName;
                member.lastAxClass = '';
                member.lastPaxClass = '';
                member.msrId = reg.msrId;
                member.cars = [reg.car];
                member.clubRegion = '';
                member.dedicatedNumber = reg.dedicatedNumber;
                member.dateCreated = new Date();
                member.dateUpdated = new Date();
                member.addresses = [];
                member.emails = [];
                member.totalEvents = 1;
                if (reg.email.length > 0)
                    member.emails.push({address:reg.email});
                member.phones = [];
                if (reg.phone.length > 0)
                    member.phones.push({phoneType:'', number:reg.phone});
                member.sponsors = [];
                for (var i=0;i<reg.sponsors.length;i++){
                    member.sponsors.push({name:reg.sponsors[i]})
                }
                member.save(function(er){
                    //console.log('saved member');
                    memberObj = member;
                    members.push(member);
                    //callback(er, member);
                    //TODO do something else with the 
                    if (er) { importOne();}
                    else {
                        addParticipant();
                    }
                })
            }
            function addParticipant(){
                participantCount++;
                //console.log('adding participant')
                // var axclass = lookupClass(reg.axClass);
                // if (axclass == null){
                //     axclass = {name:'FUN', isLadies:false, isStock:false, paxClass:'', index:1}
                // }
                // var runs = driver.runs;

                var drivero = {
                    name: memberObj.firstName + ' ' + memberObj.lastName
                    , car: reg.car
                    , carNumber:reg.carNumber
                    , clubMemberId: reg.clubMemberId
                }
                var part = new models.participants();
                part.eventId = eid;
                part.club = {id:club._id, name:club.name};
                part.runGroup = {name:'', color:'', label:''}
                part.memberId = memberObj._id;
                part.driver = drivero;
                part.station = '';
                part.workerRole = 'None';
                part.axClass = classObj;
                part.isImported = true;
                part.paid = reg.paid;
                part.isTechd = false;

                part.save(function(er){
                    if (!er){
                        participantList.push(part);
                    } else {
                        errorList.push('Add Participant error: ' + er);
                    }

                    importOne(season, members);
                });
            }

            //lookup member
            memberObj = memberLookup();
            //do class info
            // if (parseAxClassForPax)
            //     classObj = parseClass(reg.axClass);
            // else
            //     classObj = lookupClass(reg.axClass, reg.paxClass);
            if (parseAxClassForPax)
                classObj = extractClass(paxClasses, classes, reg.axClass);
            else
                classObj = lookupClass(reg.axClass, reg.paxClass);

            if (classObj == null){
                classObj = new utils.classObj();
                classObj.name = 'INVALID:' + reg.axClass;
            }
            if (memberObj == null){
                //create new member
                addMember();
            } else {
                saveMember();
            }
        } // end if regs.len
    } // end importOne

    // get setup data
    models.seasons.findOne({ 'clubId': tevent.club.id, seasonYear: tevent.season }, function (er1, season) {
        models.participants.remove({ eventId: eid }, function (erp, delcount) {
            models.members.find({'club.id':tevent.club.id}, function(er,members){
                console.log('members found: ' + members.length);
                importOne(season, members);
            });
        });
    });
}



function getClass(season, cls){
    if (season.paxClasses.length == 0){
        var c = classLookup(season, cls);
        if (c == null){
            return {name:'FUN', index:1, paxClass:'', isLadies:false, isStock:false}
        } else {
            return c;
        }
    } else {

        for (var i=0;i<season.paxClasses.length;i++){
            var pax = season.paxClasses[i].name
                , paxlen = pax.length;
            
        }
    }
}

/*

    Import Version 2 

*/


/****

    extract data from a csv file and convert into normal format

****/

function parseCsvData(data, sep){

    var lines = data.toString().split(UNIVERSAL_NEWLINE);
    var output = [];
    if (lines.length > 1) {
        console.log('parse reg file: ' + lines.length);
        cols = parseCSVLine(lines[0],sep)[0];
        var count = 0;
        for (var i = 1; i < lines.length; i++) {
            // var p = { axclass: '', paxclass:'', msrId:null, carnumber: '', first: '', last:''
            //     , paid: false, car: {year:0, description:'',make:'',model:'', color:''}};
            var p = new regEntry();

            var items = parseCSVLine(lines[i],sep)[0];
            //output.push('<tr>');
            if (items.length > 3){
                count++;
                var usePaxedClass = false;
                for (var a = 0; a < items.length; a++) {
                    switch (cols[a].toLowerCase().replace(' ','')) {
                        case 'firstname':
                            p.firstName = capitalize(items[a]); break;
                        case 'lastname':
                            p.lastName = capitalize(items[a]); break;
                        case 'number':
                            p.carNumber = items[a]; break;
                        case 'no.':
                            p.carNumber = items[a]; break;
                        case 'classpaxed':
                            usePaxedClass = true;
                            p.axClass = items[a];break;
                        case 'class':
                            p.axClass = items[a]; break;
                        case 'paid':
                            p.paid = items[a].toLowerCase() == 'yes'; break;
                        case 'amnt.':
                            p.paidAmount = parseFloat(items[a]);break;
                        case 'carcolor':
                            p.car.color = items[a]; break;
                        case 'color':
                            p.car.color = items[a]; break;
                        case 'year':
                            p.car.year = parseInt(items[a]); break;
                        case 'make':
                            p.car.make = capitalize(items[a]); break;
                        case 'model':
                            p.car.model = formatName(items[a]);break;
                            
                        case 'member#':
                            p.clubMemberId = items[a];break;
                        case 'carmodel':
                            p.car.year = parseInt(items[a].trim().substring(0, 4));
                            p.car.year = p.car.year > 1900 ? p.car.year : 0;
                            var card = '';
                            if (p.car.year > 0)
                                card = items[a].substring(4).trim();
                            else
                                card = p.car.description = items[a];
                            
                            p.car.description = card;
                            var carda = card.trim().split(' ');
                            p.car.make = carda[0];
                            carda.shift();
                            if (carda.length > 0)
                                p.car.model = carda.join(' ');
                            break;

                    }
                }
                //do car description
                p.car.description = (p.car.year > 0 ? p.car.year.toString() + ' ' : '')
                    + p.car.make + ' ' + p.car.model;

                //ignore imports without the base required.
                if (p.carNumber.length > 0 && (p.firstName.length > 0 || p.lastName.length > 0) && p.axClass.length > 0)
                    p.importStatus = true;

                output.push(p);
            }
            //console.log(p);
            //output.push('</tr>');
        }
        //output.push('</table>');

        
    }
    else {
        console.log('no lines to parse.');
        output = [];
    }

    return output;
}


// function validateRegEntries(season, classes, paxClasses, regs) {

//     for (var i = 0; i < regs.length; i++) {
//         regs[i]
//     };
// }


function eventFromCsv(data, callback){
	// returns {firstName, lastName, car:{model, make, year, color}, carNumber
	// , axclass, runs: [{rawTime, cones, dnf}]}
	var start = new Date().getTime();
	console.log('Starting event import')
	

	var lines = data.split(UNIVERSAL_NEWLINE);
	// get column headers
	var output = [];
	var count = 0;
    if (lines.length > 1) {
        cols = parseCSVLine(lines[0])[0];
        var count = 0;
        for (var i = 1; i < lines.length; i++) {
            var p = { axclass: '', carnumber: '', first: '', last:''
            	, paid: false, car: {year:0, description:'',make:'',model:'', color:''}
            	, runs:[]// time, cones, penalty
            };
            var items = parseCSVLine(lines[i])[0];
            //output.push('<tr>');
            if (items.length > 4){
                count++;
                for (var a = 0; a < items.length; a++) {
                	var whichcol = cols[a].trim().toLowerCase();

                	if (whichcol == 'driver'){
                		var name = items[a];
                    	if (name.indexOf(',') > -1){
                    		var nar = name.split(',');
                    		if (nar.length == 2) {
                    			p.first = nar[1].trim();
                    			p.last = nar[0].trim();
                    		} else {
                    			p.first = name;
                    			p.last = '';
                    		}
                    		
                    	} else {
                    		var nar = name.split(' ');
                    		p.first = nar[0];
                    		nar.shift();
                    		p.last = nar.join(' ');
                    	}
                    } else if (whichcol == 'class') {
                    	p.axclass = items[a].trim();
                    } else if (whichcol == 'car') {
                    	var c = items[a];
                    	c = c.replace('  ',' ').split(' ');
						if (parseInt(c[0]) > 0)
							p.car.year = parseInt(c[0]);
						if (c.length == 2)
						{
							p.car.model = c[1];
						}
						if (c.length > 2){
							p.car.make = c[1];
							c.shift();
							c.shift();
							p.car.model = c.join(' ');
						}
                    	p.car.description = items[a];
                    } else if (whichcol.indexOf('run ') > -1) {
                    	var t = items[a]
                    		, time = 0
                    		, cones = 0
                    		, penalty = '';

                    	if (t != null && t.trim().length > 0) {
                    		if (t.toLowerCase() == 'dnf') {
                    			penalty = 'dnf';
                    		}
                    		else if (t.toLowerCase() == 'off') {
                    			penalty = 'off';
                    		}
                    		else if (t.toLowerCase() == 'rerun') {
                    			penalty = 'rerun';
                    		}
                    		else if (t.indexOf('(') > -1) {
                    			var p1 = t.indexOf('(');
                    			var p2 = t.indexOf(')');
                    			time = parseFloat(t.substring(0,p1));
                    			cones = t.substring(p1+1, p2);

	                    	} else {
	                    		time = parseFloat(t);
	                    	}
	                    	p.runs.push({time:time, cones:cones, penalty:penalty})
                    	}
                    	

                    }

                }
                if (p.first != '' && p.runs.length > 0)
                    output.push(p);
            } // items.len > 
        }
    }
    var duration = new Date().getTime() - start;
    console.log('finished import transformation in ' + duration + 'ms');
	callback(null, output);
}

// fs.readFile('lpr-ax1-2013.csv', 'utf8', function(er, data){
// 	eventFromCsv(data, function(er, drivers){
// 		if (er) console.log('ERROR: ' + er);
// 		else {
// 			console.log(JSON.stringify(drivers));
// 		}
// 	})
// })


function validateRegistrationEntries(eventId, season, members, entries, uniqueNumberPerClass){
    var classes = season.classes;
    var paxClasses = season.paxClasses;

    function matchMember(msrId, clubMemberId, firstName, lastName){
        for (var i=0;i<members.length;i++){
            var m = members[i];
            if (msrId.length > 0) {
                if (m.msrId == msrId){
                    return m;
                }
            } else if (clubMemberId != undefined && clubMemberId.length > 0){
                if (m.clubMemberId == clubMemberId
                    && m.lastName.toLowerCase() == lastName.toLowerCase()){
                    return m;
                }
            } else if (m.firstName.toLowerCase() == firstName.toLowerCase() 
                && m.lastName.toLowerCase() == lastName.toLowerCase()){
                return m
            }
        }
        return null;
    }

    // return true if someone else has a dedicate #/class
    function checkDedicatedNumberClass(memberId, axClass, carNumber){
        for (var i = 0; i < members.length; i++) {
            // ignore the members own record
            if (memberId != members[i]._id.toString()){

                if (uniqueNumberPerClass && carNumber.toLowerCase() == members[i].dedicatedNumber.toLowerCase()
                    && axClass != null && axClass.name.toLowerCase() == members[i].dedicatedClass.toLowerCase()){
                    return true;
                }
                else if (!uniqueNumberPerClass && carNumber.toLowerCase() == members[i].dedicatedNumber.toLowerCase())
                    return true;

            }
        };
        return false;
    }

    for (var i = 0; i < entries.length; i++) {
        //validate member
        var reg = entries[i];

        // lookup existing member
        var mm = matchMember(reg.msrId, reg.clubMemberId, reg.firstName, reg.lastName);
        if (mm != null) {
            console.log('member found!');
            reg.memberId = mm._id.toString();
            reg.memberObj = mm;
        }
        else 
            reg.isNewDriver = true;
            

        // validate class exists
        var cls = extractClass(paxClasses, classes, reg.axClass);
        if (cls === null){
            reg.message += 'CLASS NOT FOUND. ' + reg.axClass;
            reg.importStatus = false;
        }
        else {
            reg.classObj = cls;
            reg.paxClass = cls.paxClass;
            reg.axClass = cls.name;
        }

        // validate class/car numbers against dedicateds

        var numberTaken = checkDedicatedNumberClass(reg.memberId, reg.classObj, reg.carNumber);

        if (numberTaken){
            reg.message+=' Car # already taken. ';
            reg.importStatus = false;
        }

    };

    // check for duplicates
    for (var i = 0; i < entries.length; i++) {
        
        for (var a = 0; a < entries.length; a++) {
            if (entries[i].carNumber == entries[a].carNumber && a !== i){
                if (!uniqueNumberPerClass){
                    entries[i].message += ' DUPLICATE Car Number. ';
                    entries[i].importStatus = false;
                } 
                else if (entries[i].axClass == entries[a].axClass && entries[i].paxClass == entries[a].paxClass){
                    entries[i].message += ' DUPLICATE Car Number in Class ' + (entries[i].paxClass.length > 0 ? (entries[i].paxClass + '-') : '' ) + entries[i].axClass + '. ';
                    entries[i].importStatus = false;
                }
            }
            
        };
    };

    return entries;
}

function importRegistrationEntries(club, members, eventId, entries, callback){

    var todos = entries.slice(0)
        , errors = []
        , participants = [];

    function saveMember(reg){
        //save car
        //console.log('saving member');
        //console.log(JSON.stringify(reg));
        var memberObj = reg.memberObj;
        if (memberObj.cars.length == 0){
            memberObj.cars = [reg.car];
            memberObj.dateUpdated = new Date();
        } else {
            var carExists = false;
            for (var i=0;i<memberObj.cars.length;i++) {
                
                if (memberObj.cars[i].make.toLowerCase() == reg.car.make.toLowerCase()
                    && memberObj.cars[i].model != undefined
                    && memberObj.cars[i].model.toLowerCase() == reg.car.model.toLowerCase()
                    && memberObj.cars[i].year == reg.car.year){
                    carExists = true;
                    break;
                }
            }
            if (!carExists){
                memberObj.cars.push(reg.car);
                memberObj.dateUpdated = new Date();
            }
        }
        memberObj.totalEvents = memberObj.totalEvents + 1;
        memberObj.save(function(er){
            //memberObj = member;
            addParticipant(memberObj._id.toString(), reg);
        })
    }

    function addMember(reg){
        //console.log('adding member: ' + reg.firstName + ', ' + reg.lastName);
        var member = new models.members();
        member.club = {id:club.id, name:club.name}
        member.clubMemberId = reg.clubMemberId;
        member.firstName = reg.firstName;
        member.lastName = reg.lastName;
        member.lastAxClass = '';
        member.lastPaxClass = '';
        member.msrId = reg.msrId || '';
        member.cars = [reg.car];
        member.clubRegion = '';
        member.dedicatedNumber = reg.dedicatedNumber;
        member.dateCreated = new Date();
        member.dateUpdated = new Date();
        member.addresses = [];
        member.emails = [];
        member.totalEvents = 1;
        if (reg.email.length > 0)
            member.emails.push({address:reg.email});
        member.phones = [];
        if (reg.phone.length > 0)
            member.phones.push({phoneType:'', number:reg.phone});
        member.sponsors = [];
        for (var i=0;i<reg.sponsors.length;i++){
            member.sponsors.push({name:reg.sponsors[i]})
        }
        member.save(function(er){
            //console.log('saved member');
            
            members.push(member);
            //callback(er, member);
            //TODO do something else with the 
            if (er) { 
                reg.memberObj = member;
                reg.message = 'Add Member error: ' + er;
                reg.importStatus = false;
                errors.push(reg);
                doOne();
            }
            else {
                addParticipant(member._id.toString(), reg);
            }
        })
    }
    function addParticipant(memberId, reg){
        
        //console.log('adding participant')
        // var axclass = lookupClass(reg.axClass);
        // if (axclass == null){
        //     axclass = {name:'FUN', isLadies:false, isStock:false, paxClass:'', index:1}
        // }
        // var runs = driver.runs;
        //console.log('adding participant.');
        //console.log(JSON.stringify(reg));
        var drivero = {
            name: reg.firstName + ' ' + reg.lastName
            , car: reg.car
            , carNumber:reg.carNumber
            , clubMemberId: reg.clubMemberId
        }
        var part = new models.participants();
        part.eventId = eventId;
        part.club = {id:club._id, name:club.name};
        part.runGroup = {name:'', color:'', label:''}
        part.memberId = memberId;
        part.driver = drivero;
        part.station = '';
        part.workerRole = 'None';
        part.axClass = reg.classObj;
        part.isImported = true;
        part.paid = reg.paid;
        part.isTechd = false;

        part.save(function(er){
            if (!er){
                participants.push(part);
            } else {
                reg.message = 'Add Participant error: ' + er;
                reg.importStatus = false;
                errors.push(reg);
            }

            doOne();
        });
    }

    function doOne(){
        var entry = todos.shift();

        if (entry === undefined){
            callback(errors.length == 0 ? null : errors, participants);
        }
        else {

            if (entry.memberId == null){
                addMember(entry);
            }
            else  {
                saveMember(entry);

                //addParticipant(entry.memberId, entry);
            }
        }
    }

    doOne();
}


module.exports = function(_config){
    models = _config.models;
    return {
        events: {
            csvImport:eventFromCsv
            , importRegistration: importEventRegistration
        }
        , registrationEntry:regEntry
        , parseCsvData: parseCsvData
        , validateRegistrationEntries: validateRegistrationEntries
        , importRegistrationEntries: importRegistrationEntries

    }
}
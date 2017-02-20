'use strict';
var util = require('util');
var fs = require('fs');
var ee = require('events').EventEmitter;
var SerialPort = require('serialport');
var serialPort = SerialPort.SerialPort;
var settings 
    , utils = require('../utils');

var 
    datalog = []
    , debug = false;

//PUBLIC
var config ={
    liveEventId: null
    , conePenalty:-1
    , timingHardware:'JaCircuitsNormal'
    , displayHardware:null
};
var sp;

require('../color');

/**
    FORMATS
    # = 48 - 57 (0-9)
    JaCircuits Normal - sends only a finished time
    ASCII - 128 # # # # # # 13 10
    248 is hardware disconnected

    JaCircuits Chrono - send start, finish and time
    ASCII: 
    start -     65 # # # # # # 13 10
    finish -    66 # # # # # # 13 10
    time -      128 # # # # # # 13 10
    split 1 -   67 # # # # # # 13 10
    split 2 -   68 # # # # # # 13 10
    248 is hardware disconnected

    RA Tlink Directly connected to Z 
    start -     65 # # # # # # # # # 13 (65 = A)
    finish -    66 # # # # # # # # # 13 (66 = B)
    battery -   90 66 # # # # # # # # 13
    integrity - 90 87 # # # # # # # # 13



**/





/***********************************************************************

    HELPERS

************************************************************************/



function calcTime(s,f){
    return (f > s ? (f - s) : (f + (1000000 - s))) / 1000;
}
function calcTime2(s,f){
    if (f < s){
        var len = s.toString().length;
        var fm = '';
        for (var i=0;i<len;i++){fm+='0';}
        fm = '1'+fm;
        return (f + (parseInt(fm) - s)) / 1000;
    }

    return (f - s) / 1000;   
}

function saveDataLog(){
    var count = datalog.length;
    if (count > 24){
        console.log('saving hardware data log.');
        var x = [];
        for (var i = 0; i < count; i++) {
            x.push(datalog.shift());
        }
        fs.appendFile('_hardwareRawOutput.log', x.join('\n')+'\n', function(er){
            if (er){
                console.log('\n\nFAILED TO WRITE RAW HARDWARE DATA to log file.\n\n');
            }
        });
    }
}

function isDigitsOnly(s){
    var reg = new RegExp(/^\d+$/);
    return reg.test(s);
}

/***********************************************************************

    DISPLAY 

************************************************************************/



function convertTimeToHexForRA6880Display(time){
    var xtime = time.toString().split('');
    var output = [0x80];
    var cnt = 0, i=0;
    xtime = xtime.reverse();
    for (i=0;i<xtime.length;i++){
        //output.push(time.toString().charCodeAt(i));
        output.push(xtime[i].toString().charCodeAt(0));
        cnt++;
    }
    for (i=0;i<6-cnt;i++){
        output.push(30);
    }
    output.push(13);
    output.push(10);

    console.log(output);
    return output;
}







var Hardware = function(_config){
    ee.call(this);
    var self = this;
    
    var 
        lastSplits = []
        , splits=[];

    var jaChronoCodes = ['A','B','C','D','E']
        , starts = []
        , onCourse = 0;

    var startsLog = []// {stamp:'000000000', timestamp:new Date().getTime()}
        , lastStartsLog = []  // lastStartsLog is added to when a start is used by a finish
        , lastStartStamp = null
        , ignoreNextStart = false;
    
    var tlinkBattery = {
        A:null, B:null, C:null
        , D:null, E:null, F:null, G:null
        , Z:null, timestamp:null
    };

    var tlinkIntegrity = {
        A:null, B:null, C:null
        , D:null, E:null, F:null, G:null
        , Z:null, timestamp:null
    };

    settings = _config.settings;


    function hardwareLog(msg){
        if (settings.debug){
            fs.appendFile('_hardwareRawLog.txt', msg+'\n');    
        }
    }

    if (settings.debug){
        //fs.appendFileSync('_hardwareRawLog.txt', '## ' + new Date() +'\n');
        hardwareLog('##ServerStart ' + new Date());
    }

    var connected = false;
    var connectedComPort = '';

    this.getStatus = function(){
        return {
            enabled: settings.hardware.enabled
            , connected: connected
            , comPort:connectedComPort
        };
    };

    // currently for tlink direct
    this.resetStart = function(){
        console.log('HARDWARE: reset start');
        if (starts.length > 0) {
             starts.pop();
            self.emit('resetstart');
        }
        else {
            console.log('no active starts to reset'.yellow);
        }
       
    };

    // currently for tlink direct
    this.resetFinish = function(){
        console.log('HARDWARE: reset finish');
        var ls = lastStartsLog.pop();
        if (ls !== undefined) {
            starts.unshift(ls);
            self.emit('resetfinish');
        }
        else{
            console.log('No finishes to reset'.yellow);
        } 
    };

    //TODO finish this.  need to emit, and handle in engine to clear all
    this.reset = function(){
        console.log('HARDWARE: full reset called.'.red);
        init();
    };

    this.getStatus = function(){
        return {
            activeStarts: starts.slice(0)
            , activeSplits: splits.slice(0)
        };
    };

    this.getBatteryStatus = function(){
        return tlinkBattery;
    };

    this.testprint = function(){
        console.log('hardware comport: ' + settings.hardware.comPort);
    };
    
    config.timingHardware = settings.hardware.interfaceType ? settings.hardware.interfaceType.toLowerCase() : null;

    //console.log(('constructor display: ' + settings.hardware.displayHardware).red);
    if (settings.hardware.displayHardware == 'RA6X80') {
        
        config.displayHardware = settings.hardware.displayHardware;
        console.log(('Using display hardware: ' + config.displayHardware).red);
    }
    
    for (var i=0;i<settings.hardware.splitCount;i++){
        splits.push([]);
        lastSplits.push('');
        console.log('created split bucket ' + (i+1));
    }

    function init(){
        starts = [];
        //lastStart = '000000';
        splits = [];
        lastSplits = [];
        lastStartsLog = [];

        for (var i=0;i<settings.hardware.splitCount;i++){
            splits.push([]);
            lastSplits.push('');
            console.log('recreated split bucket ' + (i+1));
        }
    }

    function handleDisconnect(){
        console.log('HARDWARE WAS DISCONNECTED!');
        init();
    }

    function handleJaChrono(buffer){
        var now = new Date().getTime();
        console.log('handling hardware data: ' + buffer.toString());
        //console.log('buffer.len = ' + buffer.length);
        if (buffer.length === 9) {
            var stamp = '';
            for (var i=1;i<7;i++){
                stamp += String.fromCharCode(buffer[i]);
            }
            //console.log('\tstamp: ' + stamp);

            var flagCode = buffer[0];

            if (flagCode === 66) {
                // B = finish
                var start = starts.shift();
                if (start !== undefined){
                    var time = calcTime(parseInt(start,10), parseInt(stamp,10));
                    console.log('computed finish time: ' + time);
                    
                    //lastStart = start;
                    lastStartsLog.push(start);
                    
                    var tsplits = [];
                    if (settings.hardware.splitCount > 0){
                        for (var i=0;i<settings.hardware.splitCount;i++){
                            lastSplits[i] = splits[i].shift();
                            tsplits.push(lastSplits[i]);
                        }
                    }
                    self.emit('finish', {type:'finish', s: start ,f: stamp, time: time, splits:tsplits, timestamp:now});
                    sendTimeToDisplay(time);
                }
            } else if (flagCode === 65) {
                // A = start
                starts.push(stamp);
                startsLog.push({stamp:stamp, timestamp:now});
                
                self.emit('start', {type:'start',time: stamp, timestamp:now});
            } else if (flagCode === 128) {
                //TODO figure out how to handle server restart and timing hardware has active timers
                // finish time or finish reset 
                var timeString = stamp.split('').reverse().join('');
                if (timeString === '000000'){
                    console.log('hardware sent reset finish'.red);
                    doChronoResetFinish();
                    self.emit('resetfinish', {type:'resetfinish'});
                }
                else {
                    console.log('finish data: ' + parseInt(timeString,10) / 1000);
                }
                
            } else if (flagCode === 83){
                // clear time button from farmtek
                console.log('hardware sent reset start or clear time'.red);
                starts.pop();
                self.emit('resetstart');
            }
            else if (flagCode === 67 || flagCode === 68){
                // C,D = splits
                var splitNum = flagCode === 67 ? 0 : 1;
                console.log('split ' + splitNum);
                if (splits[splitNum] !== undefined){
                    if (splits[splitNum].length < starts.length){
                        try {
                            var time = calcTime(parseInt(starts[splits[splitNum].length],10), parseInt(stamp,10));
                            splits[splitNum].push(time);
                            self.emit('split' + splitNum, {type:'split'+splitNum, time: time, timestamp:now});
                        }
                        catch (ex){
                            console.log('ERROR during split ' + splitNum + ' data receive. ' + ex);
                            self.emit('error', 'ERROR during split ' + splitNum + ' data receive. ' + ex);
                        }
                            
                    }
                    else {
                        self.emit('error', 'The split was accidentally tripped.');
                    }
                } else {
                    self.emit('error', 'Configuration issue.  Most likely the event\'s Number of Splits is not the same as the number of split timers you are using.');
                }
            }
            else if (flagCode === 248){
                self.emit('disconnected');
            }
            else {
                console.log('unknon flag code ' + flagCode);
            } 
        }
        else {
            console.log('THERE IS A HARDWARE ISSUE. ' + buffer.toString());
        }
    }


    function tLinkErrorCheck(stamp){
/*
RA error codes A/B/C/etc + "E" + code 0000000
E1 - Bad trigger data on ID B, C, D, E, F or G
E2 - Greater than 10 sec since last good data received from ID B, C, D, E, F or G
E3 - Nothing received from ID A during the last request
E4 - Greater than 10 sec since last good data received from ID A
E5 - Math overflow during calculation on ID B, C, D, E, F or G
*/
        var errorReasons = [
            , 'Unknown / Invalid'
            , 'Bad trigger data on ID B, C, D, E, F or G' //E1
            , 'Greater than 10 sec since last good data received from ID B, C, D, E, F or G' //E2
            , 'Nothing received from ID A during the last request'
            , 'Greater than 10 sec since last good data received from ID A'
            , 'Math overflow during calculation on ID B, C, D, E, F or G'
        ];

        var result = null;
        if (stamp.substring(0,1) == 'E'){
            var code = parseInt(stamp.substring(1,2));
            console.log('code: ' + code);
            result = {code: code, reason: errorReasons[code]};
            ignoreNextStart = true;
        }
        return result;
    }

    function handleTlinkDirect(flag, buffer){
        var stamp = buffer.join('');
        
        if (flag == 'A'){
            if (ignoreNextStart){
                console.log(('HARDWARE: ignoring start trigger because an error code was just received prior. Current Stamp: ' + stamp + ', Last Stamp: ' + lastStartStamp).red);
                hardwareLog('## HARDWARE: ignoring start trigger because an error code was just received prior. Current Stamp: ' + stamp + ', Last Stamp: ' + lastStartStamp);
                ignoreNextStart = false;
            }
            else if (isDigitsOnly(stamp) && parseInt(stamp) > 0) {
                if (lastStartStamp != stamp){
                    starts.push(stamp);
                    console.log(('HARDWARE: tlink start trigger.  On course: ' + starts.length).yellow);
                    self.emit('start', {type:'start', time:stamp, timestamp:new Date().getTime()});        
                } else {
                    console.log(('HARDWARE: duplidate start trigger received. An error was probably received just prior to this').yellow);
                    hardwareLog('## HARDWARE: duplidate start trigger received. An error was probably received just prior to this');
                }
                lastStartStamp = stamp;
            }
            else {
                var tlerror = tLinkErrorCheck(stamp);
                if (!tlerror) {
                    console.log(('HARDWARE: tlink start invalid time, probably a power cycle: ' + stamp).red);
                    //self.emit('error', 'HARDWARE: tlink start invalid time, probably a power cycle: ' + stamp);
                } else {
                    console.log(('HARDWARE: Tlink A error (' + stamp + '). ' + tlerror.reason).red);
                    //self.emit('error', 'HARDWARE: Tlink A error (' + stamp + '). ' + tlerror.reason);
                }
                
            }
            
        } 
        else if (flag == 'B'){
            var start =starts.shift();
            console.log(('HARDWARE: tlink finish trigger.  On course: ' + starts.length).yellow);
            if (start !== undefined){
                var time = calcTime2(parseInt(start,10), parseInt(stamp,10));
                console.log(('Finish time: ' + time).green.bold);
                //lastStart = start;
                lastStartsLog.push(start);
                var tsplits = [];
                if (settings.hardware.splitCount > 0){
                    for (var i=0;i<settings.hardware.splitCount;i++){
                        lastSplits[i] = splits[i].shift();
                        tsplits.push(lastSplits[i]);
                    }
                }
                self.emit('finish', {type:'finish', s: start ,f: stamp, time: time, splits:tsplits, timestamp:new Date().getTime()});
                sendTimeToDisplay(time);
            }
            else {
                console.log('The finish line was trigger but there are no starts.');
            }
        }
        else if (flag == 'Z'){
            //console.log('HARDWARE detected Z')
            var flag2 = buffer[0];
            if (flag2 == 'B') {//battery
                if (buffer.length ===9){
                    var tlb = 1;
                    var changed = false;
                    for (var n in tlinkBattery){
                        if (tlb < 9 && tlinkBattery[n] != parseInt(buffer[tlb])){
                            tlinkBattery[n] = parseInt(buffer[tlb]);
                            tlinkBattery.timestamp = new Date().getTime();
                            changed = true;
                        }
                        tlb++;
                    }
                    
                    //console.log('HARDWARE: batterylevel received');
                    //console.log(batteryLevel)
                    if (changed){
                        //console.log(('Tlink Battery Levels changed: A:' + tlinkBattery.A + ', B: ' + tlinkBattery.B + ', Z: ' + tlinkBattery.Z).yellow);
                        //console.log(tlinkBattery);
                        self.emit('batterylevels', tlinkBattery);    
                    }
                    
                } 
            }
            else if (flag2 == 'W'){
                //console.log('RF Integrity check received.  Not implemented');
                //TODO figure out why a ":" is used in data, shows as 10 in utility
            }
        }
        else {
            console.log('Invalid starting flag got through from hardware.  definite bug.');
        }
    }

    function handleJaNormal(buffer){
        var len = buffer.length
            , now = new Date().getTime();

        if (len === 9){
            if (buffer[0] === 128){
                var s = [];
                for (var i=1;i<7;i++){
                    s.push(String.fromCharCode(buffer[i]));
                }
                var stamp = s.reverse().join('');
                if (stamp === '000000')
                    self.emit('resetfinish');
                else {
                    var time = parseInt(stamp, 10) / 1000;
                    self.emit('newtime', { time: time, timestamp: now, output:buffer.join(' ') });
                    sendTimeToDisplay(time);
                }
                    
            }
        }
        else if (buffer.length > 0 && buffer[0] === 248){
            handleDisconnect();
            self.emit('HARDWARE: disconnected'.red);
        }
        else {
            console.log('HARDWARE: INVALID buffer RECEIVED FROM HARDWARE'.red.bold)
        }
        
        if (settings.debug) {
            var str = [];
            for (var i = 0; i < buffer.length; i++) {
                str.push(buffer[i]);
            };
            fs.appendFileSync('_hardwareRawLog.txt', str.join(' ')+'\n');
        }
    }



    var parsers = {
        jacircuitschrono: function(){
            var pack = [];
            return function(buffer){
                //console.log('DATA RECEIVED: ' + buffer.length);
                for (var i = 0; i < buffer.length; i++) {
                    var a = buffer[i];
                    pack.push(a);
                    if (a === 248){
                        self.emit('disconnected');
                        pack = [];
                        handleDisconnect();
                    }
                    else if (a === 10) {
                        if (pack.length === 9){
                            handleJaChrono(pack.slice(0));
                        }
                        else {
                            console.log('SOMETHING IS OUT OF WHACK WITH THE HARDWARE INPUT'.red)
                            console.log('buffer = ' + pack.join(','));
                        }
                        pack = [];
                    }
                };
            }
        }
        , jacircuitsnormal: function(){
            var pack = [];
            return function(buffer){
                //console.log('DATA RECEIVED: ' + buffer.length);
                console.log(buffer)
                for (var i = 0; i < buffer.length; i++) {
                    var a = buffer[i];
                    pack.push(a);
                    if (a === 248){
                        self.emit('disconnected');
                        pack = [];
                        handleDisconnect();
                    }
                    else if (a === 10) {
                        if (pack.length === 9){
                            handleJaNormal(pack.slice(0));
                        }
                        else {
                            console.log('SOMETHING IS OUT OF WHACK WITH THE HARDWARE INPUT'.red)
                            console.log('buffer = ' + pack.join(','));
                        }
                        pack = [];
                    }
                }
            };
        }
        , tlinkdirect: function(){
            var pack = [];
            return function(buffer){
                //console.log(buffer.length);
                var raw = [];
                for (var i = 0; i < buffer.length; i++) {
                    var a = buffer[i];
                    raw.push(a);
                    //console.log(a + ' - ' + String.fromCharCode(a));
                    if (a === 13){
                        //console.log('pack.len = ' + pack.length);
                        if (pack.length === 10) {
                            //start or finish trigger
                            var flag = pack[0];
                            //console.log('flag: ' + flag)
                            if (['A','B'].indexOf(flag) > -1) {
                                handleTlinkDirect(flag, pack.slice(1));
                                
                            }
                            else if (flag === 'Z') {
                                //battery levels / reception
                                handleTlinkDirect('Z', pack.slice(1));    
                            }
                        }
                        //else {console.log('len=' + pack.length)}
                        pack = [];
                    }
                    else {
                        pack.push(String.fromCharCode(a));    
                    }  
                }
                if (settings.debug){
                    fs.appendFile('_hardwareRawLog.txt', raw.join(',')+'\n');
                }
            };
        }
        , debug: function(){
            fs.writeFileSync('_hardwareRawLog.txt', '');
            return function(buffer){
                console.log('DEBUG INPUT: ' + buffer.length);
                var str = [];
                for (var i = 0; i < buffer.length; i++) {
                    console.log(i + ' = ' + buffer[i]);
                    str.push(buffer[i]);
                };
                fs.appendFileSync('_hardwareRawLog.txt', str.join(',')+'\n');
            }
                
        }
    }

    this.parsers = parsers;


    function doChronoResetFinish(){
        // put lastStart on top of starts array
        // var st = [lastStart];
        // for (var i = 0; i < starts.length; i++) {
        //     st.push(starts[i]);
        // };

        // starts = st;
        var ls = lastStartsLog.pop();
        if (ls !== undefined){
            starts.unshift(ls);
            var splt = [];
            for (var i = 0; i < settings.hardware.splitCount; i++) {
                
                splt.push([lastSplits[i]]);
                for (var a = 0; a < splits[i].length; a++) {
                    splt[i].push(splits[i][a]);
                };
            };

            splits = splt;
        }
            
    }



    // time can be in 999.999 or 999999 format
    function sendTimeToDisplay(time) {
        if (config.displayHardware !== null) {

            if (config.displayHardware == 'RA6X80') {
                var xtime = time.toFixed(3).toString().replace(/[,.]/gi, '');
                console.log('sending time to display')
                sp.write(convertTimeToHexForRA6880Display(xtime), function(er,res){
                    if (er) {
                        console.log('ERROR sending time to ' + config.displayHardware + ': ' + er);
                        self.emit('error', 'ERROR sending time to ' + config.displayHardware + ': ' + er)
                    } 
                        
                });
            }
        }
    }

    this.pause = function(){
        console.log('HARDWARE: pause called.  NOT IMPLEMENTED.');
    }
    this.on('pause', function(data){
        console.log('pause triggered.  NOT IMPLEMENTED')
    })

    this.getPorts = function(callback){
         SerialPort.list(callback);
    }

    this.on('reset', function(){
        console.log('hardware reset called. clearing starts and splits data');
        init();
        // starts = [];
        // splits = [];
        // for (var i = 0; i < settings.hardware.splitCount; i++) {
        //     splits.push([]);
        // };
        // console.log('splitcount: ' + settings.hardware.splitCount);
    });
    function stopIt(callback){
         if (sp){
            sp.close(function(er){
                sp = null;
                callback(er);
            }); 
        }
        else {
            init();
            callback();
        }
    }
    this.stop = function(callback){
       stopIt(callback);
    }
    function startIt(callback){
        init();
        sp = new serialPort(settings.hardware.comPort, { baudrate: 9600 }, true, function(er){
            if (er){
                SerialPort.list(function (err, ports) {
                    if (!ports || ports.length === 0) console.log('no serial ports');
                    var portList = [];
                    ports.forEach(function(port) {

                        var name = '"' + port.comName + '"';
                        if (port.manufacturer) name += ' - ' + port.manufacturer;
                        if (port.pnpId) name += ' : ' + port.pnpId;
                        portList.push(name);
                        console.log(name);
                        // console.log(port.pnpId);
                        // console.log(port.manufacturer);
                    });
                    var msg = 'Your specified COM port (' + settings.hardware.comPort + ') is invalid. The available ports are\n ' + portList.join('\n') + '. \n' + er;
                    self.emit('error', msg);
                });
                
                if (callback) {
                    console.log('startIt: ' + er);
                    callback(er)
                };
            }
        });

        config.liveEventId = settings.hardware.liveEventId;
        //var conePenalty = -1;
        var i = 0;
        sp.on("data", parsers[settings.hardware.interfaceType.toLowerCase()]());//handlers.jacircuitschronoosx());//handlers[handlerToUse]);

        sp.on("open", function (er) {
            console.log((settings.hardware.comPort + ' open').green);
            connected = true;
            connectedComPort = settings.hardware.comPort;

            self.emit('started');
            if (callback){
                callback();
                callback = null;
            }
        }); 
        sp.on('close', function(){
            console.log('serial port connection closed'.yellow);
            connected = false;
            connectedComPort = '';
            
            self.emit('closed');
        });
        sp.on('error', function(er){
            console.log(('serialPort error: ' + er).red);
            connected = false;
            connectedComPort = '';
            
            self.emit('error', er);
            if (callback){
                callback(er);
                callback = null;
            }
        })
    }
    this.start = function (callback){

        if (settings.isLocal && settings.hardware.enabled) {
            console.log('starting timing hardware integration...');
            //timer = require('./timer.js')(io, models, { useStartStop: true, dataFormat: 'loop' });
            var handlerToUse = settings.hardware.interfaceType ? settings.hardware.interfaceType.toLowerCase() : null;
            if (parsers[handlerToUse] === undefined){
                console.log('INVALID INTERFACE TYPE. Edit your System Settings')
                self.emit('error', 'Invalid settings.hardware.interfaceType');
                if (callback) callback('Invalid interfaceType');
            }
            else {
                console.log('using ' + handlerToUse + ' mode');
                startIt(callback);
            }
        }
        else {
            console.log('isLocal:' + settings.isLocal);
            console.log('hardware not configured, using manual entry mode.');
            if (callback) callback('Timing hardware is not enabled.');
        }
    }

    this.restart = function(callback){
        console.log('Restarting timing hardware connection')
        stopIt(function(er){
            self.start(callback);
        })
    }
}

util.inherits(Hardware, ee);

module.exports = Hardware;





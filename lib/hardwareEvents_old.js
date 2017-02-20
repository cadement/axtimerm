var util = require('util')
    , fs = require('fs');
var ee = require('events').EventEmitter;

var settings 
    , utils = require('../utils');

var starts = []
    , onCourse = 0
    , datalog = []
    , splits=[]
    , debug = false;

//PUBLIC
var config ={
    liveEventId: null
    , conePenalty:-1
    , timingHardware:'JaCircuitsNormal'
    , displayHardware:null
}
var sp;


/***********************************************************************

    HELPERS

************************************************************************/


function calcTime(s,f){
    return (f > s ? (f - s) : (f + (1000000 - s))) / 1000;
}

function saveDataLog(){
    var count = datalog.length;
    if (count > 24){
        console.log('saving hardware data log.');
        var x = [];
        for (var i = 0; i < count; i++) {
            x.push(datalog.shift());
        };
        fs.appendFile('_hardwareRawOutput.log', x.join('\n')+'\n', function(er){
            if (er){
                console.log('\n\nFAILED TO WRITE RAW HARDWARE DATA to log file.\n\n');
            }
        });
    }
}

/***********************************************************************

    DISPLAY 

************************************************************************/



function convertTimeToHexForRA6880Display(time){
    var xtime = time.toString().split('');
    var output = [0x80];
    var cnt = 0;
    xtime = xtime.reverse();
    for (var i=0;i<xtime.length;i++){
        //output.push(time.toString().charCodeAt(i));
        output.push(xtime[i].toString().charCodeAt(0));
        cnt++;
    }
    for (var i=0;i<6-cnt;i++){
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
    
    var lastStart = '000000'
        , lastSplits = [];
    var jaChronoCodes = ['A','B','C','D','E']
    // //TESTING REMOVE ME
    // setTimeout(function(){
    //     self.emit('newtime', {time:33.221, output:[], timestamp:new Date().getTime()})
    // }, 1500);
    // // end testing



    settings = _config.settings;
    
    config.timingHardware = settings.hardware.interfaceType;
    if (settings.hardware.displayHardware == 'RA6X80')
        config.displayHardware = settings.hardware.displayHardware;
    
    for (var i=0;i<settings.hardware.splitCount;i++){
        splits.push([]);
        lastSplits.push('');
        console.log('created split bucket ' + (i+1));
    }

    // var spConfig = {
    //     'JaCircuitsNormal': {
    //         parser: { baudrate: 9600, parser: parserJaCircuitsNormal() }
    //         //, handler: handlerJaCircuitsNormal
    //     }
    //     , 'JaCircuitsChrono': {
    //         parser: { baudrate: 9600, parser: parserJaCircuitsChrono() }
    //         //, handler: handlerJaCircuitsChrono
    //     }
    // }



    function parserJaCircuits(){
        var data = [];
        var isStart = false
            , isFinish = false
            , splitNum = -1;
        
        //TODO add a time id;
        //var debugLog = [], debugCount = 0;

        return function (emitter, buffer) {

            if (settings.hardware.interfaceType == 'JaCircuitsNormal') {
                for (var nn=0;nn<buffer.length;nn++){
                    var b = buffer[nn];
                    var a = String.fromCharCode(b);
                    //console.log('recv: ' + b);
                    if (b == 128) {
                        data = [];
                    }
                    else if (b == 13) {
                        var r = data.reverse();
                        var s = 3;
                        if (r.length == 5) { s = 2; }
                        var t = r.slice(0, s).join('') + '.' + r.slice(s).join('');
                        //emitter.emit("data", "time: " + t + ", raw: " + data.join(''));
                        if (data.join('') == '000000')
                            self.emit('resetfinish');
                        else {
                            self.emit('newtime', { time: parseFloat(t), timestamp: new Date().getTime(), output:data });
                            sendTimeToDisplay(parseFloat(t));
                        }

                    }
                    else if (b == 10){
                        // done
                    }
                    else {
                        if (jaChronoCodes.indexOf(a) > -1){
                            self.emit('error', 'It appears your timing hardware is setup of Chrono mode, but AXti.me RM is not.')
                            
                        }
                        data.push(String.fromCharCode(b));
                    }
                }
            } else if (settings.hardware.interfaceType == 'JaCircuitsChrono') {
                for (var i = 0; i < buffer.length; i++) {
                    var b = buffer[i];
                    var a = String.fromCharCode(b);
                    
                    if (settings.debug) {
                        datalog.push(b);
                        saveDataLog();
                    }

                    //if (settings.debug) console.log('b==' + b + ', a==' + a)
                    
                    if (a == 'A') {
                        //start code
                        data = [];
                        isStart = true;
                        onCourse++;
                    }
                    else if (a == 'B') {
                        //finish code
                        isFinish = true;
                        data = [];
                        onCourse--;
                    }
                    else if (a == 'C'){
                        splitNum = 0;
                        data = [];
                    }
                    else if (a == 'D'){
                        splitNum = 1;
                        data = [];
                    }
                    else if (b == 10) {
                        var code = data.join('');
                        if (settings.debug) console.log('code = ' + code);
                        //TODO we should be able to get the final run time instead of computing it on Farmtek
                        if (code == '000000'){
                            //do reset finish
                            doChronoResetFinish();
                            self.emit('resetfinish', {type:'resetfinish'});
                        }
                        else if (isStart) {
                            starts.push(data.join(''));
                            self.emit('start', {type:'start',time: data.join(''), timestamp:new Date().getTime()});
                        } else if (isFinish) {
                            lastStart = starts.shift();
                            var s = parseInt(lastStart,10);
                            var f = parseInt(data.join(''),10);
                            var t = calcTime(s,f);
                            var tsplits = [];
                            for (var i=0;i<settings.hardware.splitCount;i++){
                                lastSplits[i] = splits[i].shift();
                                tsplits.push(lastSplits[i]);
                            }
                            
                            self.emit('finish', {type:'finish', s: s ,f: f, time: t, splits:tsplits, timestamp:new Date().getTime()});
                            sendTimeToDisplay(t);
                        }
                        else if (splitNum > -1){
                            var time = 0;
                            if (splits[splitNum] !== undefined){
                                if (splits[splitNum].length < starts.length){
                                    try {
                                        var s = parseInt(starts[splits[splitNum].length],10);
                                        var f = parseInt(data.join(''),10);
                                        time = calcTime(s,f);
                                        splits[splitNum].push(time);
                                        self.emit('split' + splitNum, {type:'split'+splitNum, time: time, timestamp:new Date().getTime()});
                                    }
                                    catch (er){
                                        console.log('ERROR during split ' + splitNum + ' data receive. ' + er);
                                        self.emit('error', 'ERROR during split ' + splitNum + ' data receive. ' + er)
                                    }
                                }
                                else {
                                    self.emit('error', 'The split was accidentally tripped.')
                                }
                            }
                            else {
                                self.emit('error', 'Configuration issue.  Most likely the event\'s Number of Splits is not the same as the number of split timers you are using.')
                            }
                            
                            
                        }
                        else {
                            // this should be a finish time, but we ignore since we are handling it in the calculation at stop/finish event
                            var tcode = data.reverse().join('');
                            
                            console.log('this should be the finish time: ' + (parseInt(tcode,10) / 1000));
                        }
                        
                        
                        isStart = isFinish = false;
                        splitNum = -1;

                    }
                    else if (b == 128){
                        data = [];
                    }
                    else if (b == 248){
                        data = [];
                        self.emit('disconnected');
                    }
                    else if (b == 13 || b==128){
                        //don't do anything with it
                        //if (settings.debug) console.log('b=' + b);
                    }
                    else if (a >= 0 && a <= 9) {
                        data.push(a);
                    }
                }
            }
            else {
                self.emit('error', 'Invalid settings.hardware.interfaceType')
            }



        };
    }



    function doChronoResetFinish(){
        // put lastStart on top of starts array
        var st = [lastStart];
        for (var i = 0; i < starts.length; i++) {
            st.push(starts[i]);
        };

        starts = st;
        var splt = [];
        for (var i = 0; i < settings.hardware.splitCount; i++) {
            splt.push([lastSplits[i]]);
            for (var a = 0; a < splits[i].length; a++) {
                splt[i].push(splits[i][a]);
            };
        };

        splits = splt;

    }



    // time can be in 999.999 or 999999 format
    function sendTimeToDisplay(time) {
        if (config.displayHardware !== null) {

            if (config.displayHardware == 'RA6X80') {
                var xtime = time.toFixed(3).toString().replace(/[,.]/gi, '');
                sp.write(convertTimeToHexForRA6880Display(xtime), function(er,res){
                    if (er) {
                        console.log('ERROR sending time to ' + config.displayHardware + ': ' + er);
                        self.emit('error', 'ERROR sending time to ' + config.displayHardware + ': ' + er)
                    } 
                        
                });
            }
        }
    }


    this.on('pause', function(data){
        console.log('pause triggered.  NOT IMPLEMENTED')
    })


    this.on('reset', function(){
        console.log('hardware reset called. clearing starts and splits data');
        starts = [];
        splits = [];
        for (var i = 0; i < settings.hardware.splitCount; i++) {
            splits.push([]);
        };
        console.log('splitcount: ' + settings.hardware.splitCount);
    });


    this.start = function (){

        if (settings.isLocal && settings.hardware.enabled) {
            console.log('starting timing hardware integration...');
            //timer = require('./timer.js')(io, models, { useStartStop: true, dataFormat: 'loop' });

            
            
            try
            {

                var SerialPort = require('serialport')
                    , serialPort = SerialPort.SerialPort;
                
                console.log('using ' + settings.hardware.interfaceType + ' mode');

                //sp = new serialPort(settings.hardware.comPort, parserJaCircuits());   

                //TODO break this out into sp.open              
                sp = new serialPort(settings.hardware.comPort, { baudrate: 9600, parser: parserJaCircuits() }, true, function(er){
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
                            var msg = 'Your specified COM port (' + settings.hardware.comPort + ') is invalid. The available ports are ' + portList.join(',') + '. \n' + er;
                            self.emit('error', msg);
                        });
                        
                    }
                });

                config.liveEventId = settings.hardware.liveEventId;
                //var conePenalty = -1;
                var i = 0;
                sp.on("open", function (er) {
                    console.log(settings.hardware.comPort + ' open');
                    //sp.write(String.fromCharCode(128)+'99999\n')
                    //sp.on('data', spConfig[config.timingHardware].handler);//sp.on(data
                }); 

                sp.on('error', function(er){
                    console.log('serialPort error: ' + er);
                    self.emit('error', er);
                })
            }
            catch (ex){
                console.log('Error initiating serialPort');
                console.log(ex);
                self.emit('error', ex);
            }

        }
        else {
            console.log('isLocal:' + settings.isLocal);
            console.log('hardware not configured, using manual entry mode.');
        }
    }
}

util.inherits(Hardware, ee);

module.exports = Hardware;





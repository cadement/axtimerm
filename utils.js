var crypto = require('crypto')
    , request = require('request')
    , version = require('./package.json').version
    , settings = require('./settings')
    , os = require('os');

var computerName = os.hostname()
    , computeAr = [os.type(), os.platform(), os.arch(), os.release()]
    , cpus = os.cpus()
    , cpu = cpus.length + ' x ' + cpus[0].model 
    ;
computeAr.push(cpu);
settings.rmLiveUrl = 'http://live.axti.me';
if (process.env.NODE_ENV == 'dev')
    settings.rmLiveUrl = 'http://localhost:3000';


var decode = decodeURIComponent;

module.exports = {
    parseCookie: function(str, opt) {
        opt = opt || {};
        var obj = {}
        var pairs = str.split(/; */);
        var dec = opt.decode || decode;

        pairs.forEach(function(pair) {
            var eq_idx = pair.indexOf('=')

            // skip things that don't look like key=value
            if (eq_idx < 0) {
                return;
            }

            var key = pair.substr(0, eq_idx).trim()
            var val = pair.substr(++eq_idx, pair.length).trim();

            // quoted values
            if ('"' == val[0]) {
                val = val.slice(1, -1);
            }

            // only assign once
            if (undefined == obj[key]) {
                try {
                    obj[key] = dec(val);
                } catch (e) {
                    obj[key] = val;
                }
            }
        });

        return obj;
    }
    , encrypt: function (text) {
        var cipher = crypto.createCipher('aes-256-cbc', 'W1uyLa9l')
        var crypted = cipher.update(text, 'utf8', 'hex')
        crypted += cipher.final('hex');
        return crypted;
    }
    , decrypt: function (text) {
        var decipher = crypto.createDecipher('aes-256-cbc', 'W1uyLa9l')
        var dec = decipher.update(text, 'hex', 'utf8')
        dec += decipher.final('utf8');
        return dec;
    }
    , date2: function (dt) {
        var d = new Date(dt);
    
        var curr_date = d.getDate();
        if (curr_date < 10) {curr_date = '0'+curr_date;}
        var curr_month = d.getMonth() + 1;
        if (curr_month < 10) curr_month = '0' + curr_month;
        var curr_year = d.getFullYear();
    
        return curr_year + '-' + (curr_month) + '-' + curr_date;
    
    }
    , date2int:function(dt){
        return dt.getFullYear() * 10000 + (dt.getMonth() + 1) * 100 + dt.getDate();
    }
    , parseClass: function(ocls, paxClasses, classes){
        var classFound = false;
        var result = {}
            , paxClass = ''
            , axClass = ocls;

        for (var i=0;i<paxClasses.length;i++){
            if (ocls.toLowerCase().lastIndexOf(paxClasses[i].name.toLowerCase(), 0) === 0){
                //pax class detected, trim 
                console.log('pax class detected: ' + ocls);
                paxClass = paxClasses[i].name;
                axClass = ocls.substring(paxClass.length+1);
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
        result.paxClass = paxClass;
        if (!classFound)
            result = null;
        else if (paxClass.length > 0){
            result.name = paxClass + '-' + axClass;
        }

        return result;
    }
    , extractClass: function(ocls, clss, paxclasses){
        var classFound = false;
        var result = {axClass:null, paxClass:''}
        var cls = ocls.toString()
            , classes =clss.slice(0); 

        //first check for pax class

        if (paxclasses.length > 0){
            for (var px=0;px<paxclasses.length;px++){
                if (ocls.toString().toLowerCase().lastIndexOf(paxclasses[px].name.toString().toLowerCase(), 0) === 0){
                    //pax class detected, trim 
                    result.paxClass = paxclasses[px].name;
                    cls = ocls.substring(result.paxClass.length);
                }
            }
        }
        
        for (var c = 0; c < classes.length; c++) {
            if (cls.toLowerCase() == classes[c].name.toString().toLowerCase()) {
                result.axClass = classes[c];
                classFound = true;
                break;
            }
        }

        if (result.paxClass != '' && classFound){
            result.axClass.name = result.paxClass + '-' + result.axClass.name;
            result.axClass.paxClass = result.paxClass;
        } 

        if (!classFound){
            console.log("didn't find " + ocls);
            console.log(paxclasses.length + ', ' + classes.length + ' - ' + ocls + ', ' + result.axClass + ', ' + result.paxClass + ', ' + cls);
            result = null;
        }

        return result;
    }
    , extractClass2: function (paxClasses, classes, className){
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
    , checkLastestVersion:function(club, callback){
        
        try{
            var data = {
                cloudKey: settings.cloudKey
                , os: os.platform()
                , cn: computerName
                , n: club 
                , c: computeAr.join('||')
                , v: version
            }

            request({
                url: settings.rmLiveUrl + '/api/version/latest'
                , method:'POST'
                , form: data
                , timeout:10000
            }, function(er, resp, body){
                if (er) callback({success:false, nointernet:true, message:'No internet connection. ' + er, latest:''});
                else if (resp.statusCode == 200) {
                    try {
                        var result = JSON.parse(body);
                        callback({success:true, nointernet:false, message:'', latest:result.current})
                    } 
                    catch (er){
                        callback({success:false, nointernet:true, message:'Error getting to the internet. ' + er, latest:''})
                    }
                } else {
                    callback({success:false, nointernet:false, message:'There was an error on the AXti.me server.', latest:''})
                }
            })
        }
        catch (er){
            callback({success:false, nointernet:true, message:'Error: ' + er})
        }

        // try {
        //     request.get({url:'http://api.axti.me/Version/GetLatest',timeout:10000}, function(er, resp, body){
        //         if (er) callback({success:false, nointernet:true, message:'No internet connection. ' + er, latest:''});
        //         else if (resp.statusCode == 200) {
        //             try {
        //                 var result = JSON.parse(body);
        //                 callback({success:true, nointernet:false, message:'', latest:result.current})
        //             } 
        //             catch (er){
        //                 callback({success:false, nointernet:true, message:'Error getting to the internet. ' + er, latest:''})
        //             }
        //         } else {
        //             callback({success:false, nointernet:false, message:'There was an error on the AXti.me server.', latest:''})
        //         }
        //     });
        // }
        
    
            
    }
    , classObj: function(){
        return {
            name:''
            , index:1.0
            , category:''
            , include:true
            , description:''
            , isLadies:false
            , isStock:false
            , paxClass:''
        }
    }

}
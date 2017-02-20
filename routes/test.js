var color = require('../color');

var fs = require('fs');

module.exports = function (app, models, io) {


    app.get('/demo/dummydata/:id', function(req,res){
        if (req.user && req.user.role == 'Club Admin') {
            if (req.params.id == 'backupfirst'){
                require('../lib/dummy')(models, io, function(er){
                    if (er) console.log('error: ' + er);
                    console.log('done');
                    res.send('All members, events and seasons have been replaced with demo data.');
                });
            }
            else {
                res.send('Not authorized.')
            }
        } else {
            res.send('You must be a Club admin.');
        }
    });

    app.get('/init/loadscca', function(req,res){
        var yr = new Date().getFullYear();
        models.clubs.findOne({}, function(er, club){
            models.seasons.findOne({clubId:club._id, seasonYear:yr}, function(er, season){
                if (!season)
                    season = new models.season();

                res.send('ok');
            })
        });
    })

    app.get('/test/loadclasses/:clubid', function (req, res) {
        var cid = req.params.clubid;
        models.seasons.findOne({ clubId: cid, seasonYear: 2013 }, function (er, season) {
            var list = [
                
            ];

            season.classes = list;
            season.save();
            res.send('done');
        });
    });

    //TEST DATA 

    app.get('/api/test/data/:eid', function (req, res) {
        var eid = req.params.eid;
        
        res.send({ status: 'ok', count: 99 });
    });


}
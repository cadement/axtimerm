module.exports = function (mongoose) {

    var ObjectId = mongoose.Schema.ObjectId;

    var TtodSchema = new mongoose.Schema({
        eventId: ObjectId
        , ttod: { time: { type: Number, default: 0.0 }, driver: { type: String, default: '-' }, car: { type: String, default: '-' }, carNumber: { type: String, default: '-' } }
        , pax: { time: { type: Number, default: 0.0 }, driver: { type: String, default: '-' }, car: { type: String, default: '-' }, carNumber: { type: String, default: '-' } }
        , mens: { time: { type: Number, default: 0.0 }, driver: { type: String, default: '-' }, car: { type: String, default: '-' }, carNumber: { type: String, default: '-' } }
        , womens: { time: { type: Number, default: 0.0 }, driver: { type: String, default: '-' }, car: { type: String, default: '-' }, carNumber: { type: String, default: '-' } }
        , showroomStock: { time: { type: Number, default: 0.0 }, driver: { type: String, default: '-' }, car: { type: String, default: '-' }, carNumber: { type: String, default: '-' } }
        , fun: { time: { type: Number, default: 0.0 }, driver: { type: String, default: '-' }, car: { type: String, default: '-' }, carNumber: { type: String, default: '-' } }
        , coneKiller: { count: { type: Number, default: 0 }, driver: { type: String, default: '-' }, car: { type: String, default: '-' }, carNumber: { type: String, default: '-' } }
        , dnfs: { count: { type: Number, default: 0 }, driver: { type: String, default: '-' }, car: { type: String, default: '-' }, carNumber: { type: String, default: '-' } }
        , reruns: { count: { type: Number, default: 0 }, driver: { type: String, default: '-' }, car: { type: String, default: '-' }, carNumber: { type: String, default: '-' } }
    });
    TtodSchema.index({ 'eventId': 1 });

    this.model = mongoose.model('TtodModel', TtodSchema);
    return this;
}


//var mongoose = require('mongoose')
//  , Schema = mongoose.Schema;

//var TtodSchema = new Schema({
//    eventId: ObjectId
//	, ttod: { time: { type: Number, default: 0.0 }, driver: String, car: String, carNumber: String }
//	, pax: { time: { type: Number, default: 0.0 }, driver: String, car: String, carNumber: String }
//	, mens: { time: { type: Number, default: 0.0 }, driver: String, car: String, carNumber: String }
//	, womens: { time: { type: Number, default: 0.0 }, driver: String, car: String, carNumber: String }
//	, showroomStock: { time: { type: Number, default: 0.0 }, driver: String, car: String, carNumber: String }
//	, fun: { time: { type: Number, default: 0.0 }, driver: String, car: String, carNumber: String }
//	, coneKiller: { count: { type: Number, default: 0 }, driver: String, car: String, carNumber: String }
//	, dnfs: { count: { type: Number, default: 0 }, driver: String, car: String, carNumber: String }
//	, reruns: { count: { type: Number, default: 0 }, driver: String, car: String, carNumber: String }
//});
//TtodSchema.index({ 'eventId': 1 });

//module.exports = mongoose.model('TtodModel', TtodSchema);
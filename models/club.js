module.exports = function (mongoose) {
    var ClubSchema = new mongoose.Schema({
        name: String
        , shortName: String
        , guestPassword: String
        , AXRId: Number
        , AXRPassword: String
        , uniqueNumberPerClass:{type:Boolean, default:false}
        , msrUsername: {type:String, default:null}
        , msrPassword: {type:String, default:null}
        , msrOrganizationId: {type:String, default:null}
        , dbVersion: {type:String, default:null}
        , cloudKey:{type:String, default:null}
        , lastVersionCheck:Number
    });
    ClubSchema.index({ 'name': 1 });
    this.model = mongoose.model('ClubModel', ClubSchema);
    return this;
}
//var mongoose = require('mongoose')
//  , Schema = mongoose.Schema;

//var ClubSchema = new Schema({
//    name: String
//	, shortName: String
//	, AXRId: Number
//	, AXRPassword: String
//});
//ClubSchema.index({ 'name': 1 });
//module.exports = mongoose.model('ClubModel', ClubSchema);
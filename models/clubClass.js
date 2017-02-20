module.exports = function (mongoose) {

    var ClubClassSchema = new mongoose.Schema({
        club: { name: String }
        , name: String
        , description: String
        , index: { type: Number, default: 1.0 }
        , isLadies: { type: Boolean, default: false }
    });

    ClubClassSchema.index({ 'club': 1 });

    this.model = mongoose.model('ClubClassModel', ClubClassSchema);
    return this;
}


//var mongoose = require('mongoose')
//  , Schema = mongoose.Schema;

//var ClubClassSchema = new Schema({
//    club: { name: String }
//	, name: String
//	, description: String
//	, index: { type: Number, default: 1.0 }
//});

//ClubClassSchema.index({ 'club': 1 });

//module.exports = mongoose.model('ClubClassModel', ClubClassSchema);
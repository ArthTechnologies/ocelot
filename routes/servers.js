const express = require("express");
const router = express.Router();
let techname;

let names = [];
let softwares = [];
let versions = [];
// set names to the first word of each line in servers.txt, softwares to the second word, and versions to the third word
var fs = require('fs');
var array = fs.readFileSync('servers.csv').toString().split("\n");
for(i in array) {
	
		
		names.push(array[i].split(",")[0]);
		softwares.push(array[i].split(",")[1]);
		versions.push(array[i].split(",")[2]);
		//remove null values
		versions = versions.filter(function (el) {
			return el != null;
		});
		softwares = softwares.filter(function (el) {
			return el != null;
		});
		names = names.filter(function (el) {
			return el != "";
		});
	
	
}
console.log("names: " + names);

var amount = -1;


//set amount to the amount of lines in servers.txt

var array = fs.readFileSync('servers.csv').toString().split("\n");
for(i in array) {

	amount++;

}


router.post(`/`, function(req, res) {
	//add cors header
	res.header("Access-Control-Allow-Origin", "*");
	res.status(200).json({
		names: names,
		amount: amount,
		versions: versions,
		softwares: softwares,
	});
});







module.exports = router;

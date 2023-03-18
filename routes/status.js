const express = require("express");
const Router = express.Router();
const fs = require("fs");


Router.get("/", (req, res) => {
	let resp = {};
	
	let request = require("request");
	request("https://api.arthmc.xyz", function(error, response, body){
		if (error){
			resp["quartz"] = "Offline";
		} else {
			if (response.statusCode != 502) {
			resp["quartz"] = "Online";
			} else {
				resp["quartz"] = "Offline";
			}
		}
	});

	request("https://servers.arthmc.xyz", function(error, response, body){
		if (error){
			resp["observer"] = "Offline";
		} else {
			if (response.statusCode != 502) {
			resp["observer"] = "Online";
			} else {
				resp["observer"] = "Offline";
			}
		}
	});


	

	let net = require("net");
	let client = new net.Socket();
	client.connect(25565, "arthmc.xyz", function() {
		resp["arthnetwork"] = "Online";
		client.destroy();
	});
	client.on('error', function(err) {
		console.log(err);
		resp["arthnetwork"] = "Offline";
	});

	let inter = 10;
	//check every 50 ms
	let interval = setInterval(function(){
		if(resp["arthnetwork"] != undefined && resp["observer"] != undefined && resp["quartz"] != undefined){
			clearInterval(interval);
			res.send(resp);
		}
		inter++;
		if (inter > 50){
			inter = 50;
		}
	}, inter);





});

module.exports = Router;

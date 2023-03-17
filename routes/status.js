const express = require("express");
const Router = express.Router();
const fs = require("fs");


Router.get("/", (req, res) => {
	let resp = {};
	//ping api.arthmc.xyz
	let ping = require("ping");
	let quartz = ping.sys.probe("api.arthmc.xyz", function(isAlive){
		console.log(isAlive);
		switch (isAlive) {
			case true: isAlive = "Online"; break;
			case false: isAlive = "Offline"; break;
		}
		resp["quartz"] = isAlive;
		
	});
	//ping servers.arthmc.xyz. Last time, it would say Online even if its offline, because nginx was running. So, I'll send a GET request to the server and see if theres a 502.
	let request = require("request");
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


		console.log("Connected");
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

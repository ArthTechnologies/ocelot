const express = require("express");
const Router = express.Router();
const fs = require("fs");


Router.get("/:posttype/", (req, res) => {
	  let path = "files/" + req.params.posttype + "/index.json";
	let text = "";
	//log the current working directory
	console.log("path: " + path);
	//log the path

	if (fs.existsSync(path)) {

		fs.readFile(path, "utf8", (err, data) => {
			if (err) {
				console.log(err);
			}
			res.send(data)
		});

	} else {

		res.send({"msg":"File no found"})
	}

});

module.exports = Router;

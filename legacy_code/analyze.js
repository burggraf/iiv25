var calculateResults = require("./calculateResults");

//String.prototype.startsWith = function(str) 
//{return (this.match("^"+str)==str);};

//String.prototype.endsWith = function(str) 
//{return (this.match(str+"$")==str);};

String.prototype.truncate = function(truncateLength){
	if (typeof truncateLength == "undefined") { truncateLength = 25; }
	var expr = new RegExp("^.{0," + truncateLength + "}[\S]*");
    var re = this.match(expr);
    var l = re[0].length;
    var re = re[0].replace(/\s$/,'');
    if(l < this.length){
        //re = re + "&hellip;";
        re = re + "...";    	
    }
    return re;
}

function stringWithFormat(str)
{
	var i = 0;
	for(i = 1; i < arguments.length; i++)
	{
		str = str.replace(/%[@di]/,arguments[i]);
  	}
  	return str;
}

if(!String.builder)
{
	String.builder = function(initStr)
	{
		var buffer = [];
		if (initStr)
		{
			buffer.push(initStr);
		}
		this.append = function(str)
		{
			buffer.push(str);
		};
		this.clear = function()
		{
			buffer = null;
			buffer = [];
		};
		this.insert = function(index, str)
		{
			if(buffer[index]){buffer[index] = str;}
			else{return false;}
		};
		this.replace = function(find, replace)
		{
			var exp;
			if (typeof find == "object")
			{
				exp = find;				
			}
			else
			{
				exp = new RegExp(find,'gm');				
			}
			for(var i=0,j=buffer.length;i<j;i++)
			{
				buffer[i] = buffer[i].replace(exp,replace);
			}
		};
		// replaceSequential method:
		// 			does a global search and replace just like "replace"
		// 			but appends an incrementing digit onto the replacement value
		//			for each result found
		//			for example:
		//			"I saw an item, then another item, and then a third item."
		//			replaceSequential("item", "thing")
		//			"I saw an thing0, then another thing1, and then a third thing2."
		this.replaceSequential = function(find, replace)
		{
			for(var i=0;i<buffer.length;i++)
			{
				var exp = new RegExp(find,'gm');
				buffer[i] = buffer[i].replace(exp,replace+i);
			}
		};
		this.remove = function()
		{
			if(typeof arguments[0] == "string")
			{
				for(var i=0;i<buffer.length;i++)
				{
					if(arguments[0] == buffer[i]){buffer.splice(i, 1);}
				}
			}
			else
			{
				var index = arguments[0];
				var length = (arguments.length > 1) ? arguments[1] : 1;
				buffer.splice(index,length);
			}
		};
		this.length = function() { return buffer.length;};
		this.toString = function()
		{
			return buffer.join("");
			/*
			var str = "";
			for(var i=0;i<buffer.length;i++)
			{
				str += buffer[i];
			}
			return str;
			*/
		};
	};
}


var config = require("./config");
var mysql = require('mysql');

var masterIngredientList = {};

var objIngredient = null;//{};
var objMfgIngredient = null;

var getIngredientsObject = function getIngredientsObject() {
	//console.log("** getIngredientsObject()");
	//var objIngredient = {};
	objIngredient = {};
	objMfgIngredient = {};
	var connection = mysql.createConnection(config.connection);

	connection.connect();
	var sql = "select title,class from ingredients order by title";
	connection.query(sql, function(err, rows) {
		if (err) {
			console.log("analyze.js reported:");
			console.log("ERROR loading ingredients: " + err);			
		} else {
			//console.log("** getIngredientsObject got " + rows.length + " rows");
			for (var i=0; i < rows.length; i++)
			{
				objIngredient[rows[i].title.toLowerCase()] = rows[i]["class"];	
				//console.log(rows[i].title.toLowerCase() + "=" + rows[i].class);			
			}
			connection.query("select mfg,title,class from mfg_ingredients order by mfg,title", function(err, rows){
				if (err) {
					console.log("ERROR loading mfg_ingredients: " + err);
				} else {
					for (var i=0; i < rows.length; i++) {
						// create the mfg obj if it doesn't exist, i.e. objMfgIngredient[1234567] = {};
						if (typeof objMfgIngredient[rows[i].mfg] == "undefined") objMfgIngredient[rows[i].mfg] = {};
						objMfgIngredient[rows[i].mfg][rows[i].title] = rows[i].class;
					}
				}
				connection.end();
			});
			//console.log("** objIngredient is now complete");
			//return objIngredient;
			//nextFunction();
		}
	});
	//connection.end();
	//console.log("ingredients list was loaded");
};

var updateQueue = [];
var updateQueueIngredients = [];

function processUpdateQueue() {
	if (updateQueue.length == 0) {
		//console.log("done");
		return;
	}
	var ingredients = updateQueueIngredients.pop();
	var ean13 = updateQueue.pop();
	var analysis = distillIngredients(ingredients);
	updateProduct(ean13,analysis);				
	setTimeout(processUpdateQueue,250);
}

var updateNewProducts = function updateNewProducts()
{
	//console.log("** updateNewProducts");
	if (objIngredient == null) {
		console.log("updateNewProducts needs to restart...");
		getIngredientsObject();
		setTimeout(updateNewProducts,2000); // restart in 2 seconds
		return;
	}
	var connection = mysql.createConnection(config.connection);
	connection.connect();
	sql = "select ean13,ingredients from products where ingredients <> '' and ingredientsAddedToMasterList = 0 order by product_name";

	connection.query(sql, function(err, rows) {
		if (err) {
			console.log("ERROR selecting products: " + err);
		} else {
			//console.log("** need to update " + rows.length + " items");
			// don't update the queue if there's already stuff in it...
			addIngredientsToMasterList();
			if (updateQueue.length == 0) {
				for (var i=0; i < rows.length; i++)
				{
					updateQueue.push(rows[i].ean13);
					updateQueueIngredients.push(rows[i].ingredients);
					//var analysis = distillIngredients(rows[i].ingredients);
					//updateProduct(rows[i].ean13,analysis);				
				}
				processUpdateQueue();				
			}
			//console.log("Done.");
		}
	});

	connection.end();

};

var distillIngredients = function distillIngredients(ingredients) {
	ingredients = ingredients.toLowerCase();

	ingredients = ingredients.replace(/[^\x20-\x7E]/g, ""); // remove all non-printable characters

	ingredients = ingredients.replace(/\n/g," "); 	
	ingredients = ingredients.replace(/\r/g," "); 	
	ingredients = ingredients.replace(/\+/g," "); // change plus to space (probably a typo)		
	ingredients = ingredients.replace(/\?/g," "); // change question mark to space (probably a typo)		
	ingredients = ingredients.replace(/\*/g,","); // change asterisks to commas		
	ingredients = ingredients.replace(/:/g,","); // change colons to commas	
	ingredients = ingredients.replace(/([A-Za-z]{2,})\.([A-Za-z]{2,})/g,"$1,$2"); // change colons to commas	

	ingredients = ingredients.replace(/ no\. /g," # "); // change no. to #	
		
	ingredients = ingredients.replace(/\.\s/g,","); // change period followed by space to commas	
	ingredients = ingredients.replace(/\{/g, "(")
	ingredients = ingredients.replace(/\}/g,")");
	ingredients = ingredients.replace(/\[/g,"(");
	ingredients = ingredients.replace(/\]/g,")");
	ingredients = ingredients.replace(/"/g,""); // remove double-quotes
	ingredients = ingredients.replace(/;/g,",");
	ingredients = ingredients.replace(/([^ ])&/g,"$1 &"); // add space around &
	ingredients = ingredients.replace(/&([^ ])/g,"& $1"); // add space around &		

	// remove EVERYHING after "may contain trace..."  may contain traces of, may contain trace amounts, etc.
	ingredients = ingredients.replace(/manufactured in a facility.*/g," ");	
	ingredients = ingredients.replace(/may contain trace.*/g," ");	
	ingredients = ingredients.replace(/made in\s?(a)?\s?facility.*/g," ");	
	ingredients = ingredients.replace(/facility (that)?\s?processes.*/g," ");	
	ingredients = ingredients.replace(/made on (shared )?equipment.*/g," ");
	ingredients = ingredients.replace(/(made)?(manufactured)?\s?on shared equipment.*/g," ");
	ingredients = ingredients.replace(/products are made in a.*/g," ");

	ingredients = ingredients.replace(/mono\s?\-?,?\s?(and)?&?\s?diglycerides/g,"monoglycerides,diglycerides");

	ingredients = ingredients.replace(/natural and artificial flavors/g,"natural & artificial flavors");
	ingredients = ingredients.replace(/natural and artificial flavoring/g,"natural & artificial flavoring");
	ingredients = ingredients.replace(/natural and artificial flavor/g,"natural & artificial flavor");
	ingredients = ingredients.replace(/ and\s?(\/)?\s?(or)? /g,",");
	ingredients = ingredients.replace(/ preserve(d)? with /g,",");

	// remove extraneous commas such as in this:  0,5 g/serving
	// so if we see 0,0001 we change it to 0.0001
	ingredients = ingredients.replace(/([0-9]{1,5}),([0-9]{1,5})/g,"$1.$2");

	// remove spaces around commas
	while (ingredients.indexOf(", ") > -1)
		ingredients = ingredients.replace(/, /g,",");
	while (ingredients.indexOf(" ,") > -1)
		ingredients = ingredients.replace(/ ,/g,",");
		
	var ingredient = ingredients.split(",");
	// pre-parse 1: replace full sets of (paren tokens) with [braces instead]
	for (var j=0; j < ingredient.length; j++) {
		ingredient[j] = ingredient[j].replace(/\((.*)\)/g,"[$1]");
		ingredient[j] = ingredient[j].replace(/\)(.*)\(/g,"]$1[");
	}
	
	// join and split again
	ingredients = ingredient.join(",");

	// now, remaining parens should become commas
	ingredients = ingredients.replace(/\[/g,"(").replace(/\]/g,")");
	ingredients = ingredients.replace(/\(/g,",").replace(/\)/g,",").replace(/,,/g,",");
		
	ingredient = ingredients.split(",");

	var result = new String.builder();
	for (var j=0; j < ingredient.length; j++) {

		ingredient[j] = ingredient[j].replace(/^\s+|\s+$/g, ""); // remove leading and trailing spaces
		ingredient[j] = ingredient[j].replace(/all(\-)?\s?natural/g," "); // remove "all natural"
		if (ingredient[j].indexOf("sugar") == -1) {
			// do not remove "organic" if it's organic sugar
			ingredient[j] = ingredient[j].replace(/\s?organic(ally)?\s?/g," "); // remove "organic"
		}
		ingredient[j] = ingredient[j].replace(/\(.*?\)/g,""); // remove anything in parenthesis
		ingredient[j] = ingredient[j].replace(/\(?(added)?\s?(to)?\s?(promote|preserve|protect|maintain|prevent|retain)\s?(the)?\s?(product)?(s)?\s?(flavor|freshness|coloring|color|separation|caking|quality|whiteness)\s?(retention)?\)?/g," ");
		ingredient[j] = ingredient[j].replace(/\(?(added)?\s?for (flavoring|flavor|freshness|coloring|color)\)?/g," ");
		ingredient[j] = ingredient[j].replace(/\s?(an)?\s?(anti)?\s?(\-)?caking agent(s)?\s?/g," ");		
		ingredient[j] = ingredient[j].replace(/(non)?\s?(\-)?genetically engineered/g," ");
		ingredient[j] = ingredient[j].replace(/\s?preserved with\s?/g," ");
		ingredient[j] = ingredient[j].replace(/^\s*colored with\s?/g," ");		
		ingredient[j] = ingredient[j].replace(/\s?(added)?\s?(as)?\s?(a)?(an)?\s?(preservative|emulsifier|dough conditioner|drying agent)(s)?\s?/g," ");
		ingredient[j] = ingredient[j].replace(/\s?(not)?\s?(from)?\s?concentrate(s|d)?/g," ");

		ingredient[j] = ingredient[j].replace(/ % /g,"% "); // replace 94 % with 94%

		// b11992/1 lots of these....
		// if we find a 5-digit number (including dashes), remove the ingredient
		//ingredient[j] = ingredient[j].replace(/.*?[0-9\-\.#\/]{5,15}.*?/g,""); // remove entire ingredient
		

		ingredient[j] = ingredient[j].replace(/(contains)?\s?less than\s?/g," "); // remove: contains less than

		//NOT MORE THAN 2% of the following
		ingredient[j] = ingredient[j].replace(/(no)?(t)?\s?more than\s?[0-9\.\-\/]{1,5}\s?(%|percent|&)\s?(of)?\s?(the)?\s?(following)?/g," "); 
		
		// remove: 1/10 of 1% 
		ingredient[j] = ingredient[j].replace(/[0-9\.\/\-]{1,5} of [0-9\.\/\-]{1,5}\s?(%|percent|&)?\s?(of)?/g," "); 
		// remove 2.5% of
		ingredient[j] = ingredient[j].replace(/(\<)?\s?[0-9\.\-\/]{1,5}\s?(%|percent|&)\s?(of)?/g," ");
		ingredient[j] = ingredient[j].replace(/(one|two|three|four|five|six|seven|eight|nine|ten)\s?(%|percent|&)\s?(of)?/g," ");

		// remove: or less of
		ingredient[j] = ingredient[j].replace(/\s?or less\s?(of)?\s?/g," ");

		ingredient[j] = ingredient[j].replace(/allergy warning/g," ");
		
		ingredient[j] = ingredient[j].replace(/fair trade\s?(certified)?/g," ");
		
		ingredient[j] = ingredient[j].replace(/\s?stabilizer(s)?\s?/g," ");
		ingredient[j] = ingredient[j].replace(/\s?preserved by\s?/g," ");
		ingredient[j] = ingredient[j].replace(/\s?brand sweetener/g," ");
		ingredient[j] = ingredient[j].replace(/\(?(a|an)?\s?(preservative|emulsifier|stabilizer)\)?$/g," ");
		ingredient[j] = ingredient[j].replace(/adds a trivial amount of\s?/g," ");
		ingredient[j] = ingredient[j].replace(/may contain one or more of the following/g," ");
		ingredient[j] = ingredient[j].replace(/(each)?\s?(of)?\s?(the)?\s?following\s?/g," "); // each of the following
		//ingredient[j] = ingredient[j].replace(/^and\s/g," ");
		ingredient[j] = ingredient[j].replace(/\s?ingredients?\s?/g," ");
		ingredient[j] = ingredient[j].replace(/\s?(partially)?\s?dehydrated\s?/g," ");
		ingredient[j] = ingredient[j].replace(/\s?(partially)?\s?rehydrated\s?/g," ");
		ingredient[j] = ingredient[j].replace(/\s?(partially)?\s?(freeze)?(\-)?\s?dried\s?/g," ");
		ingredient[j] = ingredient[j].replace(/\s?(un)?sweetened (condensed)?/g," ");
		ingredient[j] = ingredient[j].replace(/\s?(un)?sweetened (condense)?/g," ");
		ingredient[j] = ingredient[j].replace(/\s?(un)?enrich(ed)? /g," ");

		ingredient[j] = ingredient[j].replace(/enzyme modified/g,"enzyme MODIFIED");
	
		ingredient[j] = ingredient[j].replace(/(partly )?(un)?(non)?(non\-)?(non )?(pre)?(pre\-)?(pre )?(shredded|naturally|hydrogenated|gmo|blanched|bleached|enriched|cooked|expeller pressed|extra fancy|fancy|extract of|extractive of|extractives of|freshness|fresh|fully cooked|fully|ground|hydrolyzed|includes|juices of|juice of|partially|milled|modified|passover|powdered|pulled|quartered|reconstituted|reduced fat|reduced|rehydrated|fire roasted|roasted|seasoned|whole grains|whole grain|whole|long grain par boiled|long grain parboiled)/g," ");
		ingredient[j] = ingredient[j].replace(/enzyme MODIFIED/g,"enzyme modified");

		//No Artificial Colors Or Flavors
		ingredient[j] = ingredient[j].replace(/no artificial (colors)?\s?(or)?\s?(flavor)?(ing)?(s)?\s?(added)?/g," ");

		//no artificial xyz added 
		ingredient[j] = ingredient[j].replace(/no artificial .*? added/g," ");

		//no salt added
		ingredient[j] = ingredient[j].replace(/no .*? added/g," ");

		// "salt added" changed to "salt"
		ingredient[j] = ingredient[j].replace(/ added/g," ");

		ingredient[j] = ingredient[j].replace(/^\s*and /g," ");
		ingredient[j] = ingredient[j].replace(/ and\s*$/g," ");
		ingredient[j] = ingredient[j].replace(/^\s*or /g," ");
		ingredient[j] = ingredient[j].replace(/^\s*with /g," ");
		ingredient[j] = ingredient[j].replace(/ with\s*$/g," ");
		ingredient[j] = ingredient[j].replace(/^\s*(made)?\s?from /g," ");
		ingredient[j] = ingredient[j].replace(/^\s*(made)?\s?of /g," ");
		ingredient[j] = ingredient[j].replace(/\s*artificial color(ing)?(s)?\s*/g," ");
		ingredient[j] = ingredient[j].replace(/\s*hydrogenate(d)?\s*/g," ");
		ingredient[j] = ingredient[j].replace(/^\s*(cultured)?\s?pasteurized /g," ");
		ingredient[j] = ingredient[j].replace(/^\s*includ(e)?(ing)? /g," ");
		ingredient[j] = ingredient[j].replace(/^\s*cultured /g," ");
		ingredient[j] = ingredient[j].replace(/^\s*precook(ed)? /g," ");
		ingredient[j] = ingredient[j].replace(/^\s*prepare(d)? /g," ");
		ingredient[j] = ingredient[j].replace(/^\s*process(ed)? /g," ");
		ingredient[j] = ingredient[j].replace(/^\s*pure /g," ");
		ingredient[j] = ingredient[j].replace(/^\s*puree(d)? /g," ");
		ingredient[j] = ingredient[j].replace(/^\s*purified /g," ");
		ingredient[j] = ingredient[j].replace(/\s*emulsifier(s)?\s?/g," ");
		

		ingredient[j] = ingredient[j].replace(/grown\/processed in accordance with the california foods act of 1990/g," ");

		
		ingredient[j] = ingredient[j].replace(/[0-9\.\/]{1,5}\s?(%|&|percent)? or less of\s?/g," "); //remove 2% or less of
		ingredient[j] = ingredient[j].replace(/\s?contains\s?sulfites/g," ignoresulfites ");
		ingredient[j] = ingredient[j].replace(/\s?contains\s?sulphites/g," ignoresulfites ");
		ingredient[j] = ingredient[j].replace(/\s?contains\s?/g," ");
		ingredient[j] = ingredient[j].replace(/\s?containing\s?/g," ");

		ingredient[j] = ingredient[j].replace(/may contain /g," ");
		

		while (ingredient[j].indexOf("  ") > -1) // change all instances of 2 spaces to just 1 space
			ingredient[j] = ingredient[j].replace(/  /g," ");		
					
		ingredient[j] = ingredient[j].replace(/^\s+|\s+$/g, ""); // remove leading and trailing spaces
		ingredient[j] = ingredient[j].replace(/^(\-|\.|\"|&)/g, ""); // remove leading dash or quote or period
		ingredient[j] = ingredient[j].replace(/(\-|\.|\"|&)$/g, ""); // remove trailing dash or quote or period
		ingredient[j] = ingredient[j].replace(/^\s+|\s+$/g, ""); // remove leading and trailing spaces
		
		if (ingredient[j].length > 1) // remove single-char ingredients
			result.append(ingredient[j] + "\n");
	}
	return result.toString();
};

function addIngredientsToMasterList()
{
	//masterIngredientList
	var sql = new String.builder();
	var counter = 0;
	for (var attr in masterIngredientList)
	{
		sql.append("insert ignore into ingredients (title) values ('" + attr.replace(/'/g,"''").toLowerCase() + "');\n");
		sql.append("update ingredients set productCount = productCount + " + masterIngredientList[attr] +
		  			 " where title = '" + attr.replace(/'/g,"''").toLowerCase() + "';\n");
		counter++;
	}
	if (counter == 0)
		return;
	
	//{multipleStatements: true}
	var cfg = config.connection;
	cfg.multipleStatements = true;
	var connection = mysql.createConnection(cfg);
	connection.connect();
	connection.query(sql.toString(), function(err, rows) {
		if (err) {
			console.log("***** addIngredientsToMasterList ERROR: " + err);
		} else {
			//console.log("masterIngredientList was updated with " + counter + " items");
			masterIngredientList = {};
		}
	});

	connection.end();

}

var removeDuplicates = function(unordered) {
  var result = [];
  var object = {};
  unordered.forEach(function(item) {
    object[item] = null;
  });
  result = Object.keys(object);
  return result;
};

function updateProduct(ean13,analysis)
{
	var ingr = analysis.split("\n");
	for (var i=0; i < ingr.length; i++)
	{
		if (!masterIngredientList[ingr[i]])
			masterIngredientList[ingr[i]] = 1;
		else
			masterIngredientList[ingr[i]] += 1;
	}

	var results = calculateResults.calc(analyzeProduct(analysis,"UNKNOWN",ean13).summary);
	var results_vegan = calculateResults.calc(analyzeProduct(analysis,"TRUE",ean13).summary);
	var results_vegetarian = calculateResults.calc(analyzeProduct(analysis,"FALSE",ean13).summary);
	
	var connection = mysql.createConnection(config.connection);
	connection.connect();
	var sql = "update products set ingredientsAddedToMasterList=1,calculated_code=" + results.code + ",calculated_code_sugar_vegan=" + results_vegan.code + ",calculated_code_sugar_vegetarian=" + results_vegetarian.code + ",analysis = '" + analysis.replace(/'/g,"''") + "' where ean13 = '" + ean13 + "'";
	connection.query(sql, function(err, rows) {
		if (err) {
			console.log("ERROR updating product " + ean13 + ": " + err);
		} else {
			//if (rows.changedRows > 0) {
			//}
			//console.log("updated " + ean13);
		}
	});

	connection.end();

}

var initialize = function() {
	getIngredientsObject();
};

var removeDuplicates = function(unordered) {
  var result = [];
  var object = {};
  unordered.forEach(function(item) {
    object[item] = null;
  });
  result = Object.keys(object);
  return result;
};

// takes a list of ingredients from the analysis column of the products table as input
var analyzeProduct = function analyzeProduct(analysis,debatable,ean13) {
	//console.log("** objIngredient = " + objIngredient);
	//console.log("** typeof objIngredient = " + typeof objIngredient);
	if (typeof debatable == "undefined") debatable = "UNKNOWN";
	if (objIngredient == null) {
		console.log("analyzeProduct needs to restart...");
		getIngredientsObject();
		setTimeout(function(){analyzeProduct(analysis,debatable,ean13);},2000); // restart in 2 seconds
		return;
	}

	//var counter = 0;
	//for (var aaa in objIngredient)
	//	counter++;
	analysis = analysis.toLowerCase();
		
	var summary = {};//new String.builder();
	var detail = {};//new String.builder();
	var classes = {};
	var classDetail = {};
	//debatable
	//may be non-vegetarian
	//non-vegetarian
	//typically non-vegetarian
	//typically vegan
	//typically vegetarian
	//vegan
	//vegetarian
	var ingr = removeDuplicates(analysis.split("\n"));
	var overrides_exist = false;
	var overrides_in_use = {};
	var mfg = "";
	try {
		mfg = ean13.substr(0,7);
		if (typeof objMfgIngredient[mfg] != "undefined") overrides_exist = true;
		
	} catch (overrides_existError) {
		if (ean13) {
			console.log("*** overrides_existError: " + overrides_existError + " ean13 = " + ean13);
		}
	}
	
	for (var i=0; i < ingr.length; i++)
	{
		if (ingr[i] == null || ingr[i].length == 0)
			continue;
		var ingredientClass = "unknown";
		
		if (typeof objIngredient[ingr[i]] == "string")
		{
			ingredientClass = objIngredient[ingr[i]];
		}
		// mfg override here
		// *****************
		try {
			if (overrides_exist) {
				//console.log("*** overrides_exist... ean13: " + ean13);
				if (typeof objMfgIngredient[mfg][ingr[i]] == "string") {
					ingredientClass = objMfgIngredient[mfg][ingr[i]];
					ingr[i] += "[*]";
					if (typeof overrides_in_use[ingredientClass] == "undefined") overrides_in_use[ingredientClass] = true;
				}				
			} 
		} catch (mfgOverrideError) {
				console.log("*** mfgOverrideError: " + mfgOverrideError);
		}
		// *****************
		if (ingredientClass == "ignore")
			continue; // that's what ignore means -- ignore it!
		if (ingredientClass == "debatable" && debatable == "TRUE") ingredientClass = "vegan";
		if (ingredientClass == "debatable" && debatable == "FALSE") ingredientClass = "vegetarian";
			
		if (typeof classes[ingredientClass] == "undefined") classes[ingredientClass] = 0;
		if (typeof classDetail[ingredientClass] == "undefined") classDetail[ingredientClass] = [];
		classes[ingredientClass]++;
		classDetail[ingredientClass].push(ingr[i]); // += ingr[i] + "\n";
	}
	// add an asterisk to each class that has an override
	for (var attr in overrides_in_use) {
		classDetail[attr].push("<hr>[*]&nbsp;=&nbsp;Ingredient information was verified by the manufacturer");
	}
	for (var attr in classes)
	{
		summary[attr] = classes[attr];
		//summary.append(attr + ": " + classes[attr] + "\n"); 
		detail[attr] = classDetail[attr];
		//detail.append(attr + ":\n" + classDetail[attr] + "\n"); 
	}
	var returnObject = {summary:summary,detail:detail};
	return returnObject;
};

var updateObjIngredient = function updateObjIngredient(thename,theclass)
{
	objIngredient[thename] = theclass;
}

exports.initialize = initialize;
exports.distillIngredients = distillIngredients;
exports.getIngredientsObject = getIngredientsObject;
exports.updateNewProducts = updateNewProducts;
exports.analyzeProduct = analyzeProduct;
exports.updateObjIngredient = updateObjIngredient;

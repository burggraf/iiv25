var distillIngredients = function distillIngredients(ingredients) {
	ingredients = ingredients.toLowerCase()

	ingredients = ingredients.replace(/[^\x20-\x7E]/g, '') // remove all non-printable characters

	ingredients = ingredients.replace(/\n/g, ' ')
	ingredients = ingredients.replace(/\r/g, ' ')
	ingredients = ingredients.replace(/\+/g, ' ') // change plus to space (probably a typo)
	ingredients = ingredients.replace(/\?/g, ' ') // change question mark to space (probably a typo)
	ingredients = ingredients.replace(/\*/g, ',') // change asterisks to commas
	ingredients = ingredients.replace(/:/g, ',') // change colons to commas
	ingredients = ingredients.replace(/([A-Za-z]{2,})\.([A-Za-z]{2,})/g, '$1,$2') // change colons to commas

	ingredients = ingredients.replace(/ no\. /g, ' # ') // change no. to #

	ingredients = ingredients.replace(/\.\s/g, ',') // change period followed by space to commas
	ingredients = ingredients.replace(/\{/g, '(')
	ingredients = ingredients.replace(/\}/g, ')')
	ingredients = ingredients.replace(/\[/g, '(')
	ingredients = ingredients.replace(/\]/g, ')')
	ingredients = ingredients.replace(/"/g, '') // remove double-quotes
	ingredients = ingredients.replace(/;/g, ',')
	ingredients = ingredients.replace(/([^ ])&/g, '$1 &') // add space around &
	ingredients = ingredients.replace(/&([^ ])/g, '& $1') // add space around &

	// remove EVERYHING after "may contain trace..."  may contain traces of, may contain trace amounts, etc.
	ingredients = ingredients.replace(/manufactured in a facility.*/g, ' ')
	ingredients = ingredients.replace(/may contain trace.*/g, ' ')
	ingredients = ingredients.replace(/made in\s?(a)?\s?facility.*/g, ' ')
	ingredients = ingredients.replace(/facility (that)?\s?processes.*/g, ' ')
	ingredients = ingredients.replace(/made on (shared )?equipment.*/g, ' ')
	ingredients = ingredients.replace(/(made)?(manufactured)?\s?on shared equipment.*/g, ' ')
	ingredients = ingredients.replace(/products are made in a.*/g, ' ')

	ingredients = ingredients.replace(
		/mono\s?\-?,?\s?(and)?&?\s?diglycerides/g,
		'monoglycerides,diglycerides'
	)

	ingredients = ingredients.replace(
		/natural and artificial flavors/g,
		'natural & artificial flavors'
	)
	ingredients = ingredients.replace(
		/natural and artificial flavoring/g,
		'natural & artificial flavoring'
	)
	ingredients = ingredients.replace(/natural and artificial flavor/g, 'natural & artificial flavor')
	ingredients = ingredients.replace(/ and\s?(\/)?\s?(or)? /g, ',')
	ingredients = ingredients.replace(/ preserve(d)? with /g, ',')

	// remove extraneous commas such as in this:  0,5 g/serving
	// so if we see 0,0001 we change it to 0.0001
	ingredients = ingredients.replace(/([0-9]{1,5}),([0-9]{1,5})/g, '$1.$2')

	// remove spaces around commas
	while (ingredients.indexOf(', ') > -1) ingredients = ingredients.replace(/, /g, ',')
	while (ingredients.indexOf(' ,') > -1) ingredients = ingredients.replace(/ ,/g, ',')

	var ingredient = ingredients.split(',')
	// pre-parse 1: replace full sets of (paren tokens) with [braces instead]
	for (var j = 0; j < ingredient.length; j++) {
		ingredient[j] = ingredient[j].replace(/\((.*)\)/g, '[$1]')
		ingredient[j] = ingredient[j].replace(/\)(.*)\(/g, ']$1[')
	}

	// join and split again
	ingredients = ingredient.join(',')

	// now, remaining parens should become commas
	ingredients = ingredients.replace(/\[/g, '(').replace(/\]/g, ')')
	ingredients = ingredients.replace(/\(/g, ',').replace(/\)/g, ',').replace(/,,/g, ',')

	ingredient = ingredients.split(',')

	var result = new String.builder()
	for (var j = 0; j < ingredient.length; j++) {
		ingredient[j] = ingredient[j].replace(/^\s+|\s+$/g, '') // remove leading and trailing spaces
		ingredient[j] = ingredient[j].replace(/all(\-)?\s?natural/g, ' ') // remove "all natural"
		if (ingredient[j].indexOf('sugar') == -1) {
			// do not remove "organic" if it's organic sugar
			ingredient[j] = ingredient[j].replace(/\s?organic(ally)?\s?/g, ' ') // remove "organic"
		}
		ingredient[j] = ingredient[j].replace(/\(.*?\)/g, '') // remove anything in parenthesis
		ingredient[j] = ingredient[j].replace(
			/\(?(added)?\s?(to)?\s?(promote|preserve|protect|maintain|prevent|retain)\s?(the)?\s?(product)?(s)?\s?(flavor|freshness|coloring|color|separation|caking|quality|whiteness)\s?(retention)?\)?/g,
			' '
		)
		ingredient[j] = ingredient[j].replace(
			/\(?(added)?\s?for (flavoring|flavor|freshness|coloring|color)\)?/g,
			' '
		)
		ingredient[j] = ingredient[j].replace(/\s?(an)?\s?(anti)?\s?(\-)?caking agent(s)?\s?/g, ' ')
		ingredient[j] = ingredient[j].replace(/(non)?\s?(\-)?genetically engineered/g, ' ')
		ingredient[j] = ingredient[j].replace(/\s?preserved with\s?/g, ' ')
		ingredient[j] = ingredient[j].replace(/^\s*colored with\s?/g, ' ')
		ingredient[j] = ingredient[j].replace(
			/\s?(added)?\s?(as)?\s?(a)?(an)?\s?(preservative|emulsifier|dough conditioner|drying agent)(s)?\s?/g,
			' '
		)
		ingredient[j] = ingredient[j].replace(/\s?(not)?\s?(from)?\s?concentrate(s|d)?/g, ' ')

		ingredient[j] = ingredient[j].replace(/ % /g, '% ') // replace 94 % with 94%

		// b11992/1 lots of these....
		// if we find a 5-digit number (including dashes), remove the ingredient
		//ingredient[j] = ingredient[j].replace(/.*?[0-9\-\.#\/]{5,15}.*?/g,""); // remove entire ingredient

		ingredient[j] = ingredient[j].replace(/(contains)?\s?less than\s?/g, ' ') // remove: contains less than

		//NOT MORE THAN 2% of the following
		ingredient[j] = ingredient[j].replace(
			/(no)?(t)?\s?more than\s?[0-9\.\-\/]{1,5}\s?(%|percent|&)\s?(of)?\s?(the)?\s?(following)?/g,
			' '
		)

		// remove: 1/10 of 1%
		ingredient[j] = ingredient[j].replace(
			/[0-9\.\/\-]{1,5} of [0-9\.\/\-]{1,5}\s?(%|percent|&)?\s?(of)?/g,
			' '
		)
		// remove 2.5% of
		ingredient[j] = ingredient[j].replace(/(\<)?\s?[0-9\.\-\/]{1,5}\s?(%|percent|&)\s?(of)?/g, ' ')
		ingredient[j] = ingredient[j].replace(
			/(one|two|three|four|five|six|seven|eight|nine|ten)\s?(%|percent|&)\s?(of)?/g,
			' '
		)

		// remove: or less of
		ingredient[j] = ingredient[j].replace(/\s?or less\s?(of)?\s?/g, ' ')

		ingredient[j] = ingredient[j].replace(/allergy warning/g, ' ')

		ingredient[j] = ingredient[j].replace(/fair trade\s?(certified)?/g, ' ')

		ingredient[j] = ingredient[j].replace(/\s?stabilizer(s)?\s?/g, ' ')
		ingredient[j] = ingredient[j].replace(/\s?preserved by\s?/g, ' ')
		ingredient[j] = ingredient[j].replace(/\s?brand sweetener/g, ' ')
		ingredient[j] = ingredient[j].replace(
			/\(?(a|an)?\s?(preservative|emulsifier|stabilizer)\)?$/g,
			' '
		)
		ingredient[j] = ingredient[j].replace(/adds a trivial amount of\s?/g, ' ')
		ingredient[j] = ingredient[j].replace(/may contain one or more of the following/g, ' ')
		ingredient[j] = ingredient[j].replace(/(each)?\s?(of)?\s?(the)?\s?following\s?/g, ' ') // each of the following
		//ingredient[j] = ingredient[j].replace(/^and\s/g," ");
		ingredient[j] = ingredient[j].replace(/\s?ingredients?\s?/g, ' ')
		ingredient[j] = ingredient[j].replace(/\s?(partially)?\s?dehydrated\s?/g, ' ')
		ingredient[j] = ingredient[j].replace(/\s?(partially)?\s?rehydrated\s?/g, ' ')
		ingredient[j] = ingredient[j].replace(/\s?(partially)?\s?(freeze)?(\-)?\s?dried\s?/g, ' ')
		ingredient[j] = ingredient[j].replace(/\s?(un)?sweetened (condensed)?/g, ' ')
		ingredient[j] = ingredient[j].replace(/\s?(un)?sweetened (condense)?/g, ' ')
		ingredient[j] = ingredient[j].replace(/\s?(un)?enrich(ed)? /g, ' ')

		ingredient[j] = ingredient[j].replace(/enzyme modified/g, 'enzyme MODIFIED')

		ingredient[j] = ingredient[j].replace(
			/(partly )?(un)?(non)?(non\-)?(non )?(pre)?(pre\-)?(pre )?(shredded|naturally|hydrogenated|gmo|blanched|bleached|enriched|cooked|expeller pressed|extra fancy|fancy|extract of|extractive of|extractives of|freshness|fresh|fully cooked|fully|ground|hydrolyzed|includes|juices of|juice of|partially|milled|modified|passover|powdered|pulled|quartered|reconstituted|reduced fat|reduced|rehydrated|fire roasted|roasted|seasoned|whole grains|whole grain|whole|long grain par boiled|long grain parboiled)/g,
			' '
		)
		ingredient[j] = ingredient[j].replace(/enzyme MODIFIED/g, 'enzyme modified')

		//No Artificial Colors Or Flavors
		ingredient[j] = ingredient[j].replace(
			/no artificial (colors)?\s?(or)?\s?(flavor)?(ing)?(s)?\s?(added)?/g,
			' '
		)

		//no artificial xyz added
		ingredient[j] = ingredient[j].replace(/no artificial .*? added/g, ' ')

		//no salt added
		ingredient[j] = ingredient[j].replace(/no .*? added/g, ' ')

		// "salt added" changed to "salt"
		ingredient[j] = ingredient[j].replace(/ added/g, ' ')

		ingredient[j] = ingredient[j].replace(/^\s*and /g, ' ')
		ingredient[j] = ingredient[j].replace(/ and\s*$/g, ' ')
		ingredient[j] = ingredient[j].replace(/^\s*or /g, ' ')
		ingredient[j] = ingredient[j].replace(/^\s*with /g, ' ')
		ingredient[j] = ingredient[j].replace(/ with\s*$/g, ' ')
		ingredient[j] = ingredient[j].replace(/^\s*(made)?\s?from /g, ' ')
		ingredient[j] = ingredient[j].replace(/^\s*(made)?\s?of /g, ' ')
		ingredient[j] = ingredient[j].replace(/\s*artificial color(ing)?(s)?\s*/g, ' ')
		ingredient[j] = ingredient[j].replace(/\s*hydrogenate(d)?\s*/g, ' ')
		ingredient[j] = ingredient[j].replace(/^\s*(cultured)?\s?pasteurized /g, ' ')
		ingredient[j] = ingredient[j].replace(/^\s*includ(e)?(ing)? /g, ' ')
		ingredient[j] = ingredient[j].replace(/^\s*cultured /g, ' ')
		ingredient[j] = ingredient[j].replace(/^\s*precook(ed)? /g, ' ')
		ingredient[j] = ingredient[j].replace(/^\s*prepare(d)? /g, ' ')
		ingredient[j] = ingredient[j].replace(/^\s*process(ed)? /g, ' ')
		ingredient[j] = ingredient[j].replace(/^\s*pure /g, ' ')
		ingredient[j] = ingredient[j].replace(/^\s*puree(d)? /g, ' ')
		ingredient[j] = ingredient[j].replace(/^\s*purified /g, ' ')
		ingredient[j] = ingredient[j].replace(/\s*emulsifier(s)?\s?/g, ' ')

		ingredient[j] = ingredient[j].replace(
			/grown\/processed in accordance with the california foods act of 1990/g,
			' '
		)

		ingredient[j] = ingredient[j].replace(/[0-9\.\/]{1,5}\s?(%|&|percent)? or less of\s?/g, ' ') //remove 2% or less of
		ingredient[j] = ingredient[j].replace(/\s?contains\s?sulfites/g, ' ignoresulfites ')
		ingredient[j] = ingredient[j].replace(/\s?contains\s?sulphites/g, ' ignoresulfites ')
		ingredient[j] = ingredient[j].replace(/\s?contains\s?/g, ' ')
		ingredient[j] = ingredient[j].replace(/\s?containing\s?/g, ' ')

		ingredient[j] = ingredient[j].replace(/may contain /g, ' ')

		while (ingredient[j].indexOf('  ') > -1)
			// change all instances of 2 spaces to just 1 space
			ingredient[j] = ingredient[j].replace(/  /g, ' ')

		ingredient[j] = ingredient[j].replace(/^\s+|\s+$/g, '') // remove leading and trailing spaces
		ingredient[j] = ingredient[j].replace(/^(\-|\.|\"|&)/g, '') // remove leading dash or quote or period
		ingredient[j] = ingredient[j].replace(/(\-|\.|\"|&)$/g, '') // remove trailing dash or quote or period
		ingredient[j] = ingredient[j].replace(/^\s+|\s+$/g, '') // remove leading and trailing spaces

		if (ingredient[j].length > 1)
			// remove single-char ingredients
			result.append(ingredient[j] + '\n')
	}
	return result.toString()
}

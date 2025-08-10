var distillIngredients = function distillIngredients(ingredients) {
	for (var j = 0; j < ingredient.length; j++) {
		ingredient[j] = ingredient[j].toLowerCase()

		ingredient[j] = ingredient[j].replace(/[^\x20-\x7E]/g, '') // remove all non-printable characters
		ingredient[j] = ingredient[j].replace(/([^ ])&/g, '$1 &') // add space around &
		ingredient[j] = ingredient[j].replace(/&([^ ])/g, '& $1') // add space around &

		ingredient[j] = ingredient[j].replace(/ and /g, '&') // replace and with &
		ingredient[j] = ingredient[j].replace(/ + /g, '&') // replace + with &

		// remove EVERYHING after "may contain trace..."  may contain traces of, may contain trace amounts, etc.
		ingredient[j] = ingredient[j].replace(/manufactured in a facility.*/g, ' ')
		ingredient[j] = ingredient[j].replace(/may contain trace.*/g, ' ')
		ingredient[j] = ingredient[j].replace(/made in\s?(a)?\s?facility.*/g, ' ')
		ingredient[j] = ingredient[j].replace(/facility (that)?\s?processes.*/g, ' ')
		ingredient[j] = ingredient[j].replace(/made on (shared )?equipment.*/g, ' ')
		ingredient[j] = ingredient[j].replace(/(made)?(manufactured)?\s?on shared equipment.*/g, ' ')
		ingredient[j] = ingredient[j].replace(/products are made in a.*/g, ' ')

		ingredient[j] = ingredient[j].replace(
			/mono\s?\-?,?\s?(and)?&?\s?diglycerides/g,
			'monoglycerides & diglycerides'
		)

		ingredient[j] = ingredient[j].replace(/ preserve(d)? with /g, ' ')

		ingredient[j] = ingredient[j].replace(/all(\-)?\s?natural/g, ' ') // remove "all natural"
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

		// ingredient[j] = ingredient[j].replace(/(contains)?\s?less than\s?/g, ' ') // remove: contains less than

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

		ingredient[j] = ingredient[j].replace(/enzyme modified/g, ' ')

		ingredient[j] = ingredient[j].replace(
			/(partly )?(un)?(non)?(non\-)?(non )?(pre)?(pre\-)?(pre )?(shredded|naturally|hydrogenated|gmo|blanched|bleached|enriched|cooked|expeller pressed|extra fancy|fancy|extract of|extractive of|extractives of|freshness|fresh|fully cooked|fully|ground|hydrolyzed|includes|juices of|juice of|partially|milled|modified|passover|powdered|pulled|quartered|reconstituted|reduced fat|reduced|rehydrated|fire roasted|roasted|seasoned|whole grains|whole grain|whole|long grain par boiled|long grain parboiled)/g,
			' '
		)

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
		ingredient[j] = ingredient[j].replace(/[0-9\.\/]{1,5}\s?(%|&|percent)? or less of\s?/g, ' ') //remove 2% or less of
		ingredient[j] = ingredient[j].replace(/\s?contains\s?sulfites/g, ' ')
		ingredient[j] = ingredient[j].replace(/\s?contains\s?sulphites/g, ' ')
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
	}
	return ingredients
}

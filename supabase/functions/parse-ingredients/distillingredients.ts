/**
 * Distills and cleans ingredient strings by removing superfluous words,
 * adjectives, and processing instructions to get core ingredient names
 * suitable for database matching.
 */
export function distillIngredients(ingredients: string[]): string[] {
  // ======================================================================
  // CUSTOM WORDS TO STRIP - ADD NEW WORDS HERE
  // Use * for wildcards (e.g., 'flavor*' matches flavor, flavored, flavoring)
  // ======================================================================
  const wordsToStrip = [
    'raw',
    'sprouted',
    'dry',
    'dried',
    'organic',
    'organically grown',
    'nongmo',
    'non gmo',
    'natural',
    'all natural',
    'extract',
    'nonfat',
    'non fat',
    'toasted',
    'dehydrated',
    'fresh',
    'puree*',
    'certified',
    'flavor*',  // matches flavor, flavored, flavoring, etc.
    'flavour*'
  ];

  // Convert wildcards to regex patterns and create combined pattern
  const regexPatterns = wordsToStrip.map(word => {
    if (word.includes('*')) {
      // Convert wildcards: 'flavor*' becomes 'flavor\\w*'
      return word.replace(/\*/g, '\\w*');
    }
    return word;
  });

  const customWordsPattern = new RegExp(`\\b(${regexPatterns.join('|')})\\b`, 'g');
  // ======================================================================

  // First, handle parenthetical ingredient lists early in the process
  let expandedIngredients: string[] = [];

  for (const ingredient of ingredients) {
    // Check for parenthetical lists like "fruit juice (apple, raspberry, grape)"
    const parenthesesMatch = ingredient.match(/^([^(]+)\s*\(([^)]+)\)(.*)$/);

    if (parenthesesMatch) {
      const baseIngredient = parenthesesMatch[1].trim();
      const subIngredients = parenthesesMatch[2];
      const suffix = parenthesesMatch[3].trim();

      // Split the parenthetical content by common separators
      const subIngredientList = subIngredients
        .split(/,|&|\sand\s/)
        .map(sub => sub.trim())
        .filter(sub => sub.length > 0);

      // Create expanded ingredients: "apple juice", "raspberry juice", "grape juice"
      for (const sub of subIngredientList) {
        const expandedIngredient = `${baseIngredient} ${sub} ${suffix}`.trim();
        expandedIngredients.push(expandedIngredient);
      }

      // Also keep the base ingredient if it makes sense
      if (baseIngredient.trim().length > 0) {
        expandedIngredients.push(`${baseIngredient} ${suffix}`.trim());
      }
    } else {
      // No parentheses, keep as-is
      expandedIngredients.push(ingredient);
    }
  }

  const cleanedIngredients = expandedIngredients.map(ingredient => {
    let cleaned = ingredient.toLowerCase();

    // Remove non-printable characters
    cleaned = cleaned.replace(/[^\x20-\x7E]/g, '');

    // Normalize separators - add spaces around &
    cleaned = cleaned.replace(/([^ ])&/g, '$1 &');
    cleaned = cleaned.replace(/&([^ ])/g, '& $1');

    // Replace common separators with &
    cleaned = cleaned.replace(/ and /g, '&');
    cleaned = cleaned.replace(/ \+ /g, '&');

    // Remove "may contain" warnings and facility information
    cleaned = cleaned.replace(/manufactured in a facility.*/g, '');
    cleaned = cleaned.replace(/may contain trace.*/g, '');
    cleaned = cleaned.replace(/made in\s?(a)?\s?facility.*/g, '');
    cleaned = cleaned.replace(/facility (that)?\s?processes.*/g, '');
    cleaned = cleaned.replace(/made on (shared )?equipment.*/g, '');
    cleaned = cleaned.replace(/(made)?(manufactured)?\s?on shared equipment.*/g, '');
    cleaned = cleaned.replace(/products are made in a.*/g, '');

    // Normalize mono and diglycerides
    cleaned = cleaned.replace(
      /mono\s?\-?,?\s?(and)?&?\s?diglycerides/g,
      'monoglycerides & diglycerides'
    );

    // Remove preservation and processing descriptions
    cleaned = cleaned.replace(/ preserved? with /g, ' ');
    cleaned = cleaned.replace(/all(\-)?\s?natural/g, ' ');
    cleaned = cleaned.replace(
      /\(?(added)?\s?(to)?\s?(promote|preserve|protect|maintain|prevent|retain)\s?(the)?\s?(products?)?\s?(flavor|freshness|coloring|color|separation|caking|quality|whiteness)\s?(retention)?\)?/g,
      ' '
    );
    cleaned = cleaned.replace(
      /\(?(added)?\s?for (flavoring|flavor|freshness|coloring|color)\)?/g,
      ' '
    );

    // Remove agent descriptions
    cleaned = cleaned.replace(/\s?(an)?\s?(anti)?\s?(\-)?caking agents?\s?/g, ' ');
    cleaned = cleaned.replace(/(non)?\s?(\-)?genetically engineered/g, ' ');
    cleaned = cleaned.replace(/\s?preserved with\s?/g, ' ');
    cleaned = cleaned.replace(/^\s*colored with\s?/g, ' ');
    cleaned = cleaned.replace(
      /\s?(added)?\s?(as)?\s?(a|an)?\s?(preservative|emulsifier|dough conditioner|drying agent)s?\s?/g,
      ' '
    );
    cleaned = cleaned.replace(/\s?(not)?\s?(from)?\s?concentrates?d?\s?/g, ' ');

    // Remove percentage specifications
    cleaned = cleaned.replace(
      /(no)?t?\s?more than\s?[\d\.\-\/]{1,5}\s?(%|percent|&)\s?(of)?\s?(the)?\s?(following)?/g,
      ' '
    );
    cleaned = cleaned.replace(
      /[\d\.\/\-]{1,5} of [\d\.\/\-]{1,5}\s?(%|percent|&)?\s?(of)?/g,
      ' '
    );
    cleaned = cleaned.replace(/(<)?\s?[\d\.\-\/]{1,5}\s?(%|percent|&)\s?(of)?/g, ' ');
    cleaned = cleaned.replace(
      /(one|two|three|four|five|six|seven|eight|nine|ten)\s?(%|percent|&)\s?(of)?/g,
      ' '
    );
    cleaned = cleaned.replace(/\s?or less\s?(of)?\s?/g, ' ');

    // Remove various descriptive terms
    cleaned = cleaned.replace(/allergy warning/g, ' ');
    cleaned = cleaned.replace(/fair trade\s?(certified)?/g, ' ');
    cleaned = cleaned.replace(/\s?stabilizers?\s?/g, ' ');
    cleaned = cleaned.replace(/\s?preserved by\s?/g, ' ');
    cleaned = cleaned.replace(/\s?brand sweetener/g, ' ');
    cleaned = cleaned.replace(/\(?(a|an)?\s?(preservative|emulsifier|stabilizer)\)?$/g, ' ');
    cleaned = cleaned.replace(/adds a trivial amount of\s?/g, ' ');
    cleaned = cleaned.replace(/may contain one or more of the following/g, ' ');
    cleaned = cleaned.replace(/(each)?\s?(of)?\s?(the)?\s?following\s?/g, ' ');
    cleaned = cleaned.replace(/\s?ingredients?\s?/g, ' ');

    // Remove processing descriptors
    cleaned = cleaned.replace(/\s?(partially)?\s?dehydrated\s?/g, ' ');
    cleaned = cleaned.replace(/\s?(partially)?\s?rehydrated\s?/g, ' ');
    cleaned = cleaned.replace(/\s?(partially)?\s?(freeze)?(\-)?\s?dried\s?/g, ' ');
    cleaned = cleaned.replace(/\s?(un)?sweetened (condensed?)?/g, ' ');
    cleaned = cleaned.replace(/\s?(un)?enriched?\s?/g, ' ');
    cleaned = cleaned.replace(/enzyme modified/g, ' ');

    // Remove common processing adjectives and descriptors
    cleaned = cleaned.replace(
      /(partly )?(un)?(non)?(non\-)?(non )?(pre)?(pre\-)?(pre )?(shredded|naturally|hydrogenated|gmo|blanched|bleached|enriched|cooked|expeller pressed|extra fancy|fancy|extract of|extractive of|extractives of|freshness|fresh|fully cooked|fully|ground|hydrolyzed|includes|juices of|juice of|partially|milled|modified|passover|powdered|pulled|quartered|reconstituted|reduced fat|reduced|rehydrated|fire roasted|roasted|seasoned|whole grains|whole grain|whole|long grain par boiled|long grain parboiled)/g,
      ' '
    );

    // Remove "no artificial" statements
    cleaned = cleaned.replace(
      /no artificial (colors?)?\s?(or)?\s?(flavors?)(ing)?s?\s?(added)?/g,
      ' '
    );
    cleaned = cleaned.replace(/no artificial .*? added/g, ' ');
    cleaned = cleaned.replace(/no .*? added/g, ' ');
    cleaned = cleaned.replace(/ added/g, ' ');

    // Clean up sentence structure words
    cleaned = cleaned.replace(/^\s*and /g, ' ');
    cleaned = cleaned.replace(/ and\s*$/g, ' ');
    cleaned = cleaned.replace(/^\s*or /g, ' ');
    cleaned = cleaned.replace(/^\s*with /g, ' ');
    cleaned = cleaned.replace(/ with\s*$/g, ' ');
    cleaned = cleaned.replace(/^\s*(made)?\s?from /g, ' ');
    cleaned = cleaned.replace(/^\s*(made)?\s?of /g, ' ');

    // Remove more processing terms
    cleaned = cleaned.replace(/\s*artificial colou?rings?\s*/g, ' ');
    cleaned = cleaned.replace(/\s*hydrogenated?\s*/g, ' ');
    cleaned = cleaned.replace(/^\s*(cultured)?\s?pasteurized /g, ' ');
    cleaned = cleaned.replace(/^\s*includ(e|ing)? /g, ' ');
    cleaned = cleaned.replace(/^\s*cultured /g, ' ');
    cleaned = cleaned.replace(/^\s*precooked? /g, ' ');
    cleaned = cleaned.replace(/^\s*prepared? /g, ' ');
    cleaned = cleaned.replace(/^\s*processed? /g, ' ');
    cleaned = cleaned.replace(/^\s*pure /g, ' ');
    cleaned = cleaned.replace(/^\s*pureed? /g, ' ');
    cleaned = cleaned.replace(/^\s*purified /g, ' ');
    cleaned = cleaned.replace(/\s*emulsifiers?\s?/g, ' ');
    cleaned = cleaned.replace(/[\d\.\/]{1,5}\s?(%|&|percent)? or less of\s?/g, ' ');

    // Remove sulfite warnings and "contains" statements
    cleaned = cleaned.replace(/\s?contains\s?sulfites/g, ' ');
    cleaned = cleaned.replace(/\s?contains\s?sulphites/g, ' ');
    cleaned = cleaned.replace(/\s?contains\s?/g, ' ');
    cleaned = cleaned.replace(/\s?containing\s?/g, ' ');
    cleaned = cleaned.replace(/may contain /g, ' ');

    // Protect "natural flavor*" and "natural and/& artificial flavor*" combinations before stripping individual words
    cleaned = cleaned.replace(/\bnatural\s*(&|and)\s*artificial\s+flavor(ing|s?)?\b/g, 'naturalYartificialXflavor$2');
    cleaned = cleaned.replace(/\bnatural\s+flavor(ing|s?)?\b/g, 'naturalXflavor$1');

    // Apply custom word stripping (after major processing, before final cleanup)
    cleaned = cleaned.replace(customWordsPattern, ' ');

    // Restore protected "natural flavor*" combinations
    cleaned = cleaned.replace(/naturalYartificialXflavor(ing|s)/g, 'natural & artificial flavor$1');
    cleaned = cleaned.replace(/naturalYartificialXflavor/g, 'natural & artificial flavor');
    cleaned = cleaned.replace(/naturalXflavor(ing|s)/g, 'natural flavor$1');
    cleaned = cleaned.replace(/naturalXflavor/g, 'natural flavor');

    // Clean up multiple spaces
    cleaned = cleaned.replace(/\s+/g, ' ');

    // Clean up leading/trailing characters and spaces
    cleaned = cleaned.trim();
    cleaned = cleaned.replace(/^[\-\."&]+/, '');
    cleaned = cleaned.replace(/[\-\."&]+$/, '');
    cleaned = cleaned.trim();

    return cleaned;
  });

  // Filter out empty strings and return
  return cleanedIngredients.filter(ingredient => ingredient.length > 0);
}

export default distillIngredients;
CREATE OR REPLACE FUNCTION get_ingredients_for_upc(input_upc TEXT)
RETURNS TABLE(title TEXT, class TEXT) 
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT 
    ingredient_name as title, 
    i.class
  FROM UNNEST(
    STRING_TO_ARRAY(
      RTRIM(
        (SELECT p.analysis FROM products p WHERE p.upc = input_upc),
        '~'
      ),
      '~'
    )
  ) AS ingredient_name
  LEFT JOIN ingredients i ON i.title = ingredient_name;
$$;
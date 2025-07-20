CREATE OR REPLACE FUNCTION get_ingredients_for_upc(input_upc TEXT)
RETURNS TABLE(title TEXT, class TEXT) 
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT i.title, i.class
  FROM ingredients i
  WHERE i.title = ANY(
    STRING_TO_ARRAY(
      RTRIM(
        (SELECT p.analysis FROM products p WHERE p.upc = input_upc),
        '~'
      ),
      '~'
    )
  );
$$;
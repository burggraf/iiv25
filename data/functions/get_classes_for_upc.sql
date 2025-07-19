CREATE OR REPLACE FUNCTION get_classes_for_upc(input_upc TEXT)
RETURNS TABLE(class TEXT) AS $$
  SELECT DISTINCT i.class
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
$$ LANGUAGE sql;
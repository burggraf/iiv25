CREATE OR REPLACE FUNCTION get_primary_classes_for_upc(input_upc TEXT)
RETURNS TABLE(primary_class TEXT) AS $$
  SELECT DISTINCT i.primary_class
  FROM ingredients i
  WHERE i.title = ANY(
    STRING_TO_ARRAY(
      RTRIM(
        (SELECT p.analysis FROM products p WHERE p.upc = input_upc),
        '~'
      ),
      '~'
    )
  )
  AND i.primary_class IS NOT NULL;
$$ LANGUAGE sql;
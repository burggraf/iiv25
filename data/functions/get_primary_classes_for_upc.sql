CREATE OR REPLACE FUNCTION get_primary_classes_for_upc(input_upc TEXT)
RETURNS TABLE(primary_class TEXT) AS $$
  SELECT DISTINCT COALESCE(i.primary_class, 'null') as primary_class
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
  AND COALESCE(i.primary_class, 'null') != 'ignore';
$$ LANGUAGE sql;
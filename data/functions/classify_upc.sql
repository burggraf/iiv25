CREATE OR REPLACE FUNCTION classify_upc(input_upc TEXT)
RETURNS TEXT
LANGUAGE sql
AS $$
  UPDATE products 
  SET classification = (
    WITH class_analysis AS (
      SELECT 
        COUNT(*) as total_classes,
        COUNT(*) FILTER (WHERE i.primary_class IN ('non-vegetarian', 'may be non-vegetarian', 'typically non-vegetarian', 'typically non-vegan')) as non_veg_count,
        COUNT(*) FILTER (WHERE i.primary_class = 'undetermined') as undetermined_count,
        COUNT(*) FILTER (WHERE i.primary_class IN ('vegetarian', 'typically vegetarian')) as veg_count
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
      AND i.primary_class IS NOT NULL
    )
    SELECT 
      CASE 
        WHEN total_classes = 0 THEN 'undetermined'
        WHEN non_veg_count > 0 THEN 'non-vegetarian'
        WHEN undetermined_count > 0 THEN 'undetermined'
        WHEN veg_count > 0 THEN 'vegetarian'
        ELSE 'vegan'
      END
    FROM class_analysis
  )
  WHERE upc = input_upc
  RETURNING classification;
$$;
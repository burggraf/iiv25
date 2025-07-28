CREATE OR REPLACE FUNCTION classify_upc(input_upc TEXT)
RETURNS TEXT
LANGUAGE sql
AS $$
  WITH analysis_data AS (
    SELECT 
      COUNT(*) as total_classes,
      COUNT(*) FILTER (WHERE i.primary_class IN ('non-vegetarian', 'may be non-vegetarian', 'typically non-vegetarian', 'typically non-vegan')) as non_veg_count,
      COUNT(*) FILTER (WHERE i.primary_class = 'undetermined') as undetermined_count,
      COUNT(*) FILTER (WHERE i.primary_class IN ('vegetarian', 'typically vegetarian')) as veg_count,
      COUNT(*) FILTER (WHERE i.class = 'may be non-vegetarian') as may_non_veg_count,
      COUNT(*) FILTER (WHERE i.class = 'typically vegan') as typically_vegan_count,
      COUNT(*) FILTER (WHERE i.class = 'typically vegetarian') as typically_veg_count,
      COUNT(*) FILTER (WHERE i.class IS NULL OR i.title IS NULL) as null_class_count
    FROM UNNEST(
      STRING_TO_ARRAY(
        RTRIM(
          (SELECT p.analysis FROM products p WHERE p.upc = input_upc),
          '~'
        ),
        '~'
      )
    ) AS ingredient_name
    LEFT JOIN ingredients i ON i.title = ingredient_name
  ),
  classification_result AS (
    SELECT 
      CASE 
        WHEN total_classes = 0 THEN 'undetermined'
        WHEN non_veg_count > 0 THEN 'non-vegetarian'
        WHEN undetermined_count > 0 THEN 'undetermined'
        WHEN veg_count > 0 THEN 'vegetarian'
        ELSE 'vegan'
      END as new_classification,
      CASE 
        WHEN may_non_veg_count = 0 AND typically_vegan_count = 0 AND typically_veg_count = 0 AND null_class_count = 0 THEN ''
        ELSE ARRAY_TO_STRING(
          ARRAY_REMOVE(ARRAY[
            CASE WHEN may_non_veg_count > 0 THEN 'may be non-vegetarian' END,
            CASE WHEN typically_vegan_count > 0 THEN 'typically vegan' END,
            CASE WHEN typically_veg_count > 0 THEN 'typically vegetarian' END,
            CASE WHEN null_class_count > 0 THEN 'null' END
          ], NULL),
          ', '
        )
      END as issues_text
    FROM analysis_data
  )
  UPDATE products 
  SET 
    classification = cr.new_classification,
    issues = cr.issues_text
  FROM classification_result cr
  WHERE upc = input_upc
  RETURNING classification;
$$;
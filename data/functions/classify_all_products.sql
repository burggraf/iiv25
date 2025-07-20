CREATE OR REPLACE FUNCTION classify_all_products()
RETURNS TABLE(upc_code TEXT, old_classification TEXT, new_classification TEXT)
LANGUAGE sql
AS $$
  WITH product_classifications AS (
    SELECT 
      p.upc,
      p.classification as old_classification,
      CASE 
        WHEN class_analysis.total_classes = 0 THEN 'undetermined'
        WHEN class_analysis.non_veg_count > 0 THEN 'non-vegetarian'
        WHEN class_analysis.undetermined_count > 0 THEN 'undetermined'
        WHEN class_analysis.veg_count > 0 THEN 'vegetarian'
        ELSE 'vegan'
      END as new_classification,
      CASE 
        WHEN class_analysis.may_non_veg_count = 0 AND class_analysis.typically_vegan_count = 0 AND class_analysis.typically_veg_count = 0 AND class_analysis.null_class_count = 0 THEN ''
        ELSE ARRAY_TO_STRING(
          ARRAY_REMOVE(ARRAY[
            CASE WHEN class_analysis.may_non_veg_count > 0 THEN 'may be non-vegetarian' END,
            CASE WHEN class_analysis.typically_vegan_count > 0 THEN 'typically vegan' END,
            CASE WHEN class_analysis.typically_veg_count > 0 THEN 'typically vegetarian' END,
            CASE WHEN class_analysis.null_class_count > 0 THEN 'null' END
          ], NULL),
          ', '
        )
      END as issues_text
    FROM products p
    CROSS JOIN LATERAL (
      SELECT 
        COUNT(*) as total_classes,
        COUNT(*) FILTER (WHERE i.primary_class IN ('non-vegetarian', 'may be non-vegetarian', 'typically non-vegetarian', 'typically non-vegan')) as non_veg_count,
        COUNT(*) FILTER (WHERE i.primary_class = 'undetermined') as undetermined_count,
        COUNT(*) FILTER (WHERE i.primary_class IN ('vegetarian', 'typically vegetarian')) as veg_count,
        COUNT(*) FILTER (WHERE i.class = 'may be non-vegetarian') as may_non_veg_count,
        COUNT(*) FILTER (WHERE i.class = 'typically vegan') as typically_vegan_count,
        COUNT(*) FILTER (WHERE i.class = 'typically vegetarian') as typically_veg_count,
        COUNT(*) FILTER (WHERE i.class IS NULL) as null_class_count
      FROM ingredients i
      WHERE i.title = ANY(
        STRING_TO_ARRAY(
          RTRIM(p.analysis, '~'),
          '~'
        )
      )
    ) as class_analysis
  ),
  updated AS (
    UPDATE products 
    SET 
      classification = pc.new_classification,
      issues = pc.issues_text
    FROM product_classifications pc
    WHERE products.upc = pc.upc
    RETURNING products.upc, pc.old_classification, products.classification as new_classification
  )
  SELECT upc as upc_code, old_classification, new_classification
  FROM updated;
$$;
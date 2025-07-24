#!/bin/bash
echo "Counting lines of code..."
echo -e "----------------------------------------------------------"

# Count TypeScript React files (TSX)
tsx_files=$(find . -path "./node_modules" -prune -o -path "./.expo" -prune -o -path "./ios" -prune -o -path "./android" -prune -o -name "*.tsx" -type f -print | wc -l)
tsx_lines=$(find . -path "./node_modules" -prune -o -path "./.expo" -prune -o -path "./ios" -prune -o -path "./android" -prune -o -name "*.tsx" -type f -print -exec cat {} \; | wc -l)
printf "%-30s %5d files, %8d lines\n" "TypeScript React files:" $tsx_files $tsx_lines

# Count TypeScript files
ts_files=$(find . -path "./node_modules" -prune -o -path "./.expo" -prune -o -path "./ios" -prune -o -path "./android" -prune -o -name "*.ts" -type f -print | wc -l)
ts_lines=$(find . -path "./node_modules" -prune -o -path "./.expo" -prune -o -path "./ios" -prune -o -path "./android" -prune -o -name "*.ts" -type f -print -exec cat {} \; | wc -l)
printf "%-30s %5d files, %8d lines\n" "TypeScript files:" $ts_files $ts_lines

# Count JavaScript files
js_files=$(find . -path "./node_modules" -prune -o -path "./.expo" -prune -o -path "./ios" -prune -o -path "./android" -prune -o -name "*.js" -type f -print | wc -l)
js_lines=$(find . -path "./node_modules" -prune -o -path "./.expo" -prune -o -path "./ios" -prune -o -path "./android" -prune -o -name "*.js" -type f -print -exec cat {} \; | wc -l)
printf "%-30s %5d files, %8d lines\n" "JavaScript files:" $js_files $js_lines

# Count SQL files
sql_files=$(find . -path "./node_modules" -prune -o -path "./ios" -prune -o -path "./android" -prune -o -name "*.sql" -type f -print | wc -l)
sql_lines=$(find . -path "./node_modules" -prune -o -path "./ios" -prune -o -path "./android" -prune -o -name "*.sql" -type f -print -exec cat {} \; | wc -l)
printf "%-30s %5d files, %8d lines\n" "SQL files:" $sql_files $sql_lines

# Count Supabase Edge Function files
sb_files=$(find supabase -name "*.ts" -type f 2>/dev/null | wc -l)
sb_lines=$(find supabase -name "*.ts" -type f 2>/dev/null -exec cat {} \; | wc -l)
printf "%-30s %5d files, %8d lines\n" "Supabase Edge Functions:" $sb_files $sb_lines

# Count Markdown files
md_files=$(find . -path "./node_modules" -prune -o -path "./.expo" -prune -o -path "./ios" -prune -o -path "./android" -prune -o -name "*.md" -type f -print | wc -l)
md_lines=$(find . -path "./node_modules" -prune -o -path "./.expo" -prune -o -path "./ios" -prune -o -path "./android" -prune -o -name "*.md" -type f -print -exec cat {} \; | wc -l)
printf "%-30s %5d files, %8d lines\n" "Markdown files:" $md_files $md_lines

# Count Bash/Shell files
bash_files=$(find . -path "./node_modules" -prune -o -path "./ios" -prune -o -path "./android" -prune -o -name "*.sh" -type f -print | wc -l)
bash_lines=$(find . -path "./node_modules" -prune -o -path "./ios" -prune -o -path "./android" -prune -o -name "*.sh" -type f -print -exec cat {} \; | wc -l)
printf "%-30s %5d files, %8d lines\n" "Bash/Shell files:" $bash_files $bash_lines

# Count JSON files
json_files=$(find . -path "./node_modules" -prune -o -path "./.expo" -prune -o -path "./ios" -prune -o -path "./android" -prune -o -name "*.json" -type f -print | wc -l)
json_lines=$(find . -path "./node_modules" -prune -o -path "./.expo" -prune -o -path "./ios" -prune -o -path "./android" -prune -o -name "*.json" -type f -print -exec cat {} \; | wc -l)
printf "%-30s %5d files, %8d lines\n" "JSON files:" $json_files $json_lines

# Count TOML files
toml_files=$(find . -path "./node_modules" -prune -o -path "./ios" -prune -o -path "./android" -prune -o -name "*.toml" -type f -print | wc -l)
toml_lines=$(find . -path "./node_modules" -prune -o -path "./ios" -prune -o -path "./android" -prune -o -name "*.toml" -type f -print -exec cat {} \; | wc -l)
printf "%-30s %5d files, %8d lines\n" "TOML files:" $toml_files $toml_lines

# Count Swift files (iOS)
swift_files=$(find ios -name "*.swift" -type f 2>/dev/null | wc -l)
swift_lines=$(find ios -name "*.swift" -type f 2>/dev/null -exec cat {} \; | wc -l)
printf "%-30s %5d files, %8d lines\n" "Swift files:" $swift_files $swift_lines

# Count Gradle files (Android)
gradle_files=$(find android -name "*.gradle" -type f 2>/dev/null | wc -l)
gradle_lines=$(find android -name "*.gradle" -type f 2>/dev/null -exec cat {} \; | wc -l)
printf "%-30s %5d files, %8d lines\n" "Gradle files:" $gradle_files $gradle_lines

# Calculate totals
total_files=$((tsx_files + ts_files + js_files + sql_files + sb_files + md_files + bash_files + json_files + toml_files + swift_files + gradle_files))
total_lines=$((tsx_lines + ts_lines + js_lines + sql_lines + sb_lines + md_lines + bash_lines + json_lines + toml_lines + swift_lines + gradle_lines))
echo -e "----------------------------------------------------------"
printf "%-30s %5d files, %8d lines\n" "Total:" $total_files $total_lines

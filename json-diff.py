#!/usr/bin/env python3
import json
import argparse
import sys
import numpy as np

def load_json_file(filepath):
    """Loads a JSON file from the given path with error handling."""
    try:
        with open(filepath, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"Error: The file '{filepath}' was not found.", file=sys.stderr)
        sys.exit(1)
    except json.JSONDecodeError:
        print(f"Error: The file '{filepath}' is not a valid JSON file.", file=sys.stderr)
        sys.exit(1)

def compare_numeric_array_stats(arr1, arr2, path):
    """
    Compares the statistical properties of two numeric arrays.
    Returns a list of descriptive strings for any differences found.
    """
    if not arr1 and not arr2:
        return []
    if not arr1 or not arr2: # One is empty, the other is not
        return [f"[{path}] Numeric array presence mismatch (one is empty)."]

    stats1 = {
        "count": len(arr1),
        "mean": np.mean(arr1),
        "std_dev": np.std(arr1),
        "min": np.min(arr1),
        "max": np.max(arr1),
    }
    stats2 = {
        "count": len(arr2),
        "mean": np.mean(arr2),
        "std_dev": np.std(arr2),
        "min": np.min(arr2),
        "max": np.max(arr2),
    }

    diffs = []
    if stats1["count"] != stats2["count"]:
        diffs.append(f"  - Count: {stats1['count']} vs {stats2['count']}")

    # Compare stats, using a small tolerance for floating point comparisons
    if not np.isclose(stats1['mean'], stats2['mean']):
        diffs.append(f"  - Mean: {stats1['mean']:.4f} vs {stats2['mean']:.4f} (Diff: {stats2['mean'] - stats1['mean']:.4f})")
    if not np.isclose(stats1['std_dev'], stats2['std_dev']):
        diffs.append(f"  - Std Dev: {stats1['std_dev']:.4f} vs {stats2['std_dev']:.4f}")
    if not np.isclose(stats1['min'], stats2['min']):
        diffs.append(f"  - Min: {stats1['min']} vs {stats2['min']}")
    if not np.isclose(stats1['max'], stats2['max']):
        diffs.append(f"  - Max: {stats1['max']} vs {stats2['max']}")
    
    if diffs:
        # Add a header for the statistical differences
        return [f"[{path}] Statistical differences in numeric array:"] + diffs
    return []


def compare_json(obj1, obj2, path="root"):
    """
    Recursively compares two JSON objects (Python dicts/lists).
    Returns a list of strings describing the differences.
    """
    differences = []

    # 1. Type Mismatch
    if type(obj1) is not type(obj2):
        differences.append(f"[{path}] Type mismatch: {type(obj1).__name__} vs {type(obj2).__name__}")
        return differences

    # 2. Dictionary Comparison
    if isinstance(obj1, dict):
        keys1 = set(obj1.keys())
        keys2 = set(obj2.keys())
        
        added_keys = keys2 - keys1
        removed_keys = keys1 - keys2
        common_keys = keys1 & keys2

        for key in added_keys:
            differences.append(f"[{path}] Key '{key}' added in second file.")
        for key in removed_keys:
            differences.append(f"[{path}] Key '{key}' removed in second file.")
        
        for key in common_keys:
            differences.extend(compare_json(obj1[key], obj2[key], path=f"{path}.{key}"))
    
    # 3. List Comparison
    elif isinstance(obj1, list):
        # Check if it's a numeric array for statistical comparison
        is_numeric1 = all(isinstance(x, (int, float)) for x in obj1)
        is_numeric2 = all(isinstance(x, (int, float)) for x in obj2)

        if is_numeric1 and is_numeric2:
            differences.extend(compare_numeric_array_stats(obj1, obj2, path))
        else:
            # Standard list comparison
            if len(obj1) != len(obj2):
                differences.append(f"[{path}] List length mismatch: {len(obj1)} vs {len(obj2)}")
            
            # Compare common elements
            for i, (item1, item2) in enumerate(zip(obj1, obj2)):
                differences.extend(compare_json(item1, item2, path=f"{path}[{i}]"))

    # 4. Numeric Value Comparison (int, float)
    elif isinstance(obj1, (int, float)):
        if not np.isclose(obj1, obj2):
            differences.append(f"[{path}] Numeric value mismatch: {obj1} vs {obj2} (Difference: {obj2 - obj1})")

    # 5. Other Primitive Types (str, bool, None)
    else:
        if obj1 != obj2:
            differences.append(f"[{path}] Value mismatch: '{obj1}' vs '{obj2}'")
            
    return differences

def main():
    """Main function to parse arguments and run the comparison."""
    parser = argparse.ArgumentParser(
        description="Compare the structure and numeric values of two JSON files.",
        formatter_class=argparse.RawTextHelpFormatter
    )
    parser.add_argument("file1", help="Path to the first JSON file (baseline).")
    parser.add_argument("file2", help="Path to the second JSON file (to compare).")
    args = parser.parse_args()

    print(f"Comparing '{args.file1}' (File 1) with '{args.file2}' (File 2)...\n")

    json1 = load_json_file(args.file1)
    json2 = load_json_file(args.file2)

    differences = compare_json(json1, json2)

    if not differences:
        print("✅ The JSON files are structurally and numerically equivalent.")
    else:
        print(f"❌ Found {len(differences)} difference(s):")
        for diff in differences:
            print(f"- {diff}")

if __name__ == "__main__":
    main()
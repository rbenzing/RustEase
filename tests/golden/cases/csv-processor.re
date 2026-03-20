function main()
    csv_data = "name,quantity,price\nWidget,10,5.99\nGadget,5,12.50\nDoohickey,20,3.25"
    write_file("sales.csv", csv_data)
    print("CSV file written: sales.csv")

    content = read_file("sales.csv")
    rows = content.split("\n")

    print("=== Sales Report ===")
    grand_total = 0.0
    row_num = 0

    for row in rows
        if row_num > 0
            fields = row.split(",")
            name = fields[0]
            qty = int(fields[1])
            price = float(fields[2])
            revenue = float(qty) * price
            grand_total += revenue
            print("{name}: {qty} units at {price} = {revenue}")
        end
        row_num += 1
    end

    print("Grand total revenue: {grand_total}")

    summary = "Total revenue: {grand_total}"
    write_file("summary.txt", summary)
    print("Summary written to summary.txt")
end


function celsius_to_fahrenheit(c)
    return c * 9.0 / 5.0 + 32.0
end

function fahrenheit_to_celsius(f)
    return (f - 32.0) * 5.0 / 9.0
end

function celsius_to_kelvin(c)
    return c + 273.15
end

function main()
    temp_c = 100.0
    f = celsius_to_fahrenheit(temp_c)
    print("100C = {f}F")

    temp_f = 72.0
    c = fahrenheit_to_celsius(temp_f)
    print("72F = {c}C")

    k = celsius_to_kelvin(temp_c)
    print("100C = {k}K")
end


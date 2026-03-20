function main()
  write_file("test.txt", "Hello, World!")
  content = read_file("test.txt")
  print(content)
  exists = file_exists("test.txt")
  print(exists)
  append_file("test.txt", "\nMore content")
end



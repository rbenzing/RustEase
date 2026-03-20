function make_tag(tag, content)
    return "<{tag}>{content}</{tag}>"
end

function make_hr()
    return "<hr>"
end

function main()
    markdown = "# Hello World\n## Section Two\n### Subsection\n- Item one\n- Item two\n---\nSome paragraph."
    lines = markdown.split("\n")
    for line in lines
        if line.starts_with("### ")
            print(make_tag("h3", line.replace("### ", "")))
        else if line.starts_with("## ")
            print(make_tag("h2", line.replace("## ", "")))
        else if line.starts_with("# ")
            print(make_tag("h1", line.replace("# ", "")))
        else if line.starts_with("- ")
            print(make_tag("li", line.replace("- ", "")))
        else if line.starts_with("---")
            print(make_hr())
        else
            print(make_tag("p", line.trim()))
        end
    end
end


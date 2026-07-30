import pathlib
root = pathlib.Path(__file__).resolve().parent.parent
tpl = (root/'.build/index.template.html').read_text()
js  = (root/'game.js').read_text()

def emit(out_html, css_name, extra_js, split_dir):
    css = (root/css_name).read_text()
    inline = '<style>\n'+css+'\n</style>'
    inline_js = '<script>\n'+js+'\n</script>'
    tags = '<script src="game.js"></script>'
    if extra_js:
        ejs = (root/extra_js).read_text()
        inline_js += '\n<script>\n'+ejs+'\n</script>'
        tags += '\n<script src="'+extra_js+'"></script>'
    (root/out_html).write_text(
        tpl.replace('<!--STYLE-->', inline).replace('<!--SCRIPT-->', inline_js))
    d = root/split_dir; d.mkdir(exist_ok=True)
    (d/'index.html').write_text(
        tpl.replace('<!--STYLE-->', '<link rel="stylesheet" href="'+css_name+'">')
           .replace('<!--SCRIPT-->', tags))
    (d/css_name).write_text(css)
    (d/'game.js').write_text(js)
    if extra_js:
        (d/extra_js).write_text((root/extra_js).read_text())

# index.html = RETRO (the final version, default page when hosted)
emit('index.html', 'style.css', None, 'separate-files')
# modern.html = alternative modern skin
emit('modern.html', 'style-modern.css', 'theme-modern.js', 'separate-files-modern')
print('built index.html (retro, final) + modern.html + split versions')

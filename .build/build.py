import pathlib
root = pathlib.Path(__file__).resolve().parent.parent
tpl = (root/'.build/index.template.html').read_text()
js  = (root/'game.js').read_text()

EVENT_JS = ['event.js', 'event-ui.js']

def emit(out_html, css_name, extra_js, split_dir):
    css = (root/css_name).read_text()
    inline = '<style>\n'+css+'\n</style>'
    inline_js = '<script>\n'+js+'\n</script>'
    tags = '<script src="game.js"></script>'
    # theme patch (if any) must load before the event layer
    extras = ([extra_js] if extra_js else []) + EVENT_JS
    for name in extras:
        inline_js += '\n<script>\n'+(root/name).read_text()+'\n</script>'
        tags += '\n<script src="'+name+'"></script>'
    extra_js = None
    (root/out_html).write_text(
        tpl.replace('<!--STYLE-->', inline).replace('<!--SCRIPT-->', inline_js))
    d = root/split_dir; d.mkdir(exist_ok=True)
    (d/'index.html').write_text(
        tpl.replace('<!--STYLE-->', '<link rel="stylesheet" href="'+css_name+'">')
           .replace('<!--SCRIPT-->', tags))
    (d/css_name).write_text(css)
    (d/'game.js').write_text(js)
    for name in extras:
        (d/name).write_text((root/name).read_text())
    # recorded sounds ride along so the split builds stay complete
    audio_src = root/'audio'
    if audio_src.is_dir():
        import shutil
        shutil.copytree(audio_src, d/'audio', dirs_exist_ok=True)

# index.html = RETRO (the final version, default page when hosted)
emit('index.html', 'style.css', None, 'separate-files')
# modern.html = alternative modern skin
emit('modern.html', 'style-modern.css', 'theme-modern.js', 'separate-files-modern')
print('built index.html (retro, final) + modern.html + split versions')

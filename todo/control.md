I think I've got an even better control scheme concept.

Instead of making the user hold down modifyers to work within each panel, which is faster, but requires a lot more learning and muscle memory, lets go with a modifyer light focus based system.

How this would work: 
To access a panel via the keyboard you would use [ctrl] + direction. up for timeline, right for layers, down for color, left for project. This would then focus that panel, pulling it out if it isn't already pinned and then put a red hairline over the panel to indicate that it is focused.
tap ctrl again to unfocus the panel returning controls to normal.

but while a panel is focused the control scheme switches to work with that panel.
Canvas being the default when a panel is not toggled.

so like this: 

## Global
- `?` | hide/show controls modal
- `tab` | tab through focusing each panel clockwise. if canvas focused start at timeline, otherwise move from currently focused panel.
- `shift+tab` | pin/unpin all panels
- `~` | pin/unpin all tags
- `` | tab through version tag buttons | `return` to launch
- `ctrl+z` | undo
- `ctrl+shift+z` | redo
- `ctrl+c` | copy
- `ctrl+v` | paste
- `ctrl+x` | cut
- `ctrl+a` | select all
- `ctrl+space` | play/pause timeline.

### Focus
(default = canvas)
`l-ctrl+up` | timeline
`l-ctrl+right` | layers
`l-ctrl+down` | colors
`l-ctrl+left` | projects
`l-ctrl` | canvas

## Canvas
- navigation
 - `arrows` | navigate canvas grid by tool size
 - `ctrl+space+arrows` | pan viewport
- selection
 - `shift+arrows` | selection rectangle commit on release
 - `shift+alt+arrows` | move selection
 - `shift+ctrl+arrows` | move selected
 - `shift+space` | magic wand current pixel
 - `shift+c` | select all of color under cursor in layer
 - `ctrl+a` | selct entire canvas
 - `esc` |  remove selection
- `1-9-0` | set prime color to p-chip 1-10
- tools
 - `space` |  draw
 - `backspace/delete` |  erase under curor / selected
 - `z+arrows` | erase tool
 - `ctrl+return` | flood fill at cursor, or fill entire selection
- shapes (`shift` to constrain)
  - `hold q` | square
  - `hold w` | triangle
  - `hold a` | circle
  - `hold s` | line
  - `[` | decrease tool size
  - `]` | increase tool size
  - `{` | halve tool size
  - `}` | double tool size
 - `i` | dropper color under cursor
 - `alt+arrows` | paint
- `f` |  flip selection/layer horizontal
- `F` |  flip selection/layer vertical
- `hold r+left/right` |  rotate selection/layer counter/clockwise 1degree (hold arrow for ramping rotation)
- `hold R+left/right` |  rotate selection/layer counter/clockwise 15degrees (hold arrow for ramping rotation)
- `+` | zoom in
- `-` | zoom out
- `=` | zoom canvas to viewport - pinned panels
- `_` | zoom canvas to 100%
- `g` | toggle canvas grid
- `G` | toggle canvas ruler
- `U` | toggle canvas background

## Timeline
- `left/right` |  navigate frames.
- `up/down` |  adjust framerate.
- `shift + left/right` |  select multiple frames
- `alt + left/right` |  move selected frame(s)
- `+` | new frame
- `=` | duplicate frame
- `-/backspace/delete` | remove frame
- `\` | onion toggle
- `space` | play/pause

## Layers
- `up/down` | navigate layers/groups
- `r-shift+arrows` | navigate groups only
- `shift+up/down` | select multiple layers/groups
- `alt+up/down` | move selected layer(s)/group(s)
- `left/right` | adjust layer/group transparency
- `shift+left/right` | adjust layer/group transparency by 10.
- `_/backspace/delete` | remove selected layers/groups
- `+` | new layer in current group
- `=` | new group
- `space` | expand/collapse group
- `enter` | rename focused layer/group
- `\` | toggle layer visibility

## Colors
- `left/right` | cycle prime color
- `+` | add new chip
- `-` | remove current chip
- `\` | open palette select menu
- `up/down` | navigate 
 - `return` | commit
- `return` | edit chip color
 - default to hex input
  - return to commit.
 - `arrows` | navigate color square
 - `alt+left/right` | adjust slider

## Projects
- `up/down` | navigate files and collections
- `space` | folds/unfolds the current collection
- `+` | new file into current collection
- `_` | remove selected file or collection
- `alt++` | new project
- `=` | new collection
- `return` | rename file/collection
- `shift+return` | rename project
- `e` | export current file
- `E` | export project
- `\` | open project picker

and this is how it should be broken down in the controls modal too.

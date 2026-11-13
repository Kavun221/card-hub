/*
 * ============================================================================
 *  about-content.js – THE TEXT of the About Me card. Edit this file.
 * ============================================================================
 *  How to edit
 *    - Change any text between the quotes '…'. Keep the commas between items.
 *    - Add a section: copy a { heading: …, items: [ … ] } block in "sections".
 *    - Add a link: copy a { label: …, url: … } line in "links".
 *      Only https://, http:// and mailto: links are shown (others are ignored for safety).
 *    - Add a timeline entry: copy a { when: …, what: … } line in "timeline".
 *
 *  Privacy: this file is public once the site is online. Only write what you are
 *  happy for anyone to read – no phone number, address or passwords.
 * ============================================================================
 */
window.ABOUT_ME = {
  name: 'Mr. Buell',
  title: 'Builder of the Card Hub',
  intro: 'Write a few sentences about yourself here: what you do, what you are learning and why you built this site.',

  sections: [
    { heading: 'What I work with', items: [ "Game creation", 'Add your own…'] },
    { heading: 'Currently learning', items: ['Building cards for this hub'] },
    { heading: 'Goals', items: ['Put this site on GitHub', 'Host it on my own domain'] }
  ],

  timeline: [
    { when: '2026', what: 'Started the Card Hub with the Quiz Trainer card' }
  ],

  links: [
    { label: 'GitHub', url: 'https://github.com/' }
  ]
};

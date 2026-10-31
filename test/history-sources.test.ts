// Reading the design libraries' gallery pages (tools/history-sources.ts), on small samples shaped like the pages the
// image pipeline writes (design/generals/gallery.html, design/units/<nation>/unit-cards.html).
import { describe, it, expect } from 'vitest'
import {
  armOfSlug,
  asciiId,
  decodeEntities,
  parseGallery,
  parseUnitCards,
  personIdOf,
  splitTitle,
} from '../tools/history-sources.ts'
import { ARM_RULES, DEFAULT_ARM } from '../tools/history-content.ts'

const GALLERY = `<h1>75 historical leaders</h1><div class="grid">
<figure><a href="french/napoleon-portrait-oil-v7.png"><img loading="lazy" src="french/napoleon-portrait-oil-v7.png"></a><figcaption><b>Napoleon Bonaparte</b><br>Emperor<br><a href="french/napoleon-portrait-oil-v7.prompt.txt">Exact prompt</a></figcaption></figure>
<figure><a href="british/arthur_wellesley-portrait-oil-v12.png"><img src="british/arthur_wellesley-portrait-oil-v12.png"></a><figcaption><b>Arthur Wellesley, Duke of Wellington</b><br>Commander &amp; statesman<br><a href="x">Exact prompt</a></figcaption></figure>
</div>`

const CARDS = `<div class="grid"><article id="01-fusilier"><h2>01-fusilier — Fusilier de ligne</h2><a href="01-fusilier-unit-card-plumes-v15.png"><img loading="lazy" src="01-fusilier-unit-card-plumes-v15.png" alt="01-fusilier — Fusilier de ligne"></a><p><a href="x.prompt.txt">Exact prompt</a></p></article><article id="10-kgl-light"><h2>10-kgl-light — King&#39;s German Legion — 1st Light Battalion rifleman</h2><a href="10.png"><img src="10-kgl-light-unit-card-v13.png" alt=""></a></article></div>`

describe('parseGallery', () => {
  it('reads each portrait: its file, name and role, entities decoded', () => {
    expect(parseGallery(GALLERY)).toEqual([
      { src: 'french/napoleon-portrait-oil-v7.png', name: 'Napoleon Bonaparte', role: 'Emperor' },
      {
        src: 'british/arthur_wellesley-portrait-oil-v12.png',
        name: 'Arthur Wellesley, Duke of Wellington',
        role: 'Commander & statesman',
      },
    ])
  })

  it('finds nothing in a page without figures', () => {
    expect(parseGallery('<h1>empty</h1>')).toEqual([])
  })
})

describe('parseUnitCards', () => {
  it("reads each card: its slug, its title without the slug, and the card image (not the link's)", () => {
    expect(parseUnitCards(CARDS)).toEqual([
      { slug: '01-fusilier', title: 'Fusilier de ligne', src: '01-fusilier-unit-card-plumes-v15.png' },
      {
        slug: '10-kgl-light',
        title: "King's German Legion — 1st Light Battalion rifleman",
        src: '10-kgl-light-unit-card-v13.png',
      },
    ])
  })
})

describe('splitTitle', () => {
  it('splits at the first dash and keeps the rest as the detail', () => {
    expect(splitTitle("King's German Legion — 1st Light Battalion — rifleman")).toEqual({
      name: "King's German Legion",
      detail: '1st Light Battalion — rifleman',
    })
  })

  it('gives an empty detail to a title without one', () => {
    expect(splitTitle('Feldjäger')).toEqual({ name: 'Feldjäger', detail: '' })
  })
})

describe('armOfSlug with the Napoleonic rules', () => {
  const arm = (slug: string) => armOfSlug(slug, ARM_RULES, DEFAULT_ARM)

  it('reads the common arms', () => {
    expect(arm('01-fusilier')).toBe('infantry')
    expect(arm('13-cuirassier')).toBe('cavalry')
    expect(arm('26-eight-pounder')).toBe('artillery')
    expect(arm('23-eagle-bearer')).toBe('command')
    expect(arm('24-light-horse')).toBe('mounts')
  })

  it('applies the rules in order where two could match', () => {
    // a horse gunner is artillery, not cavalry; the Horse Guards are cavalry, not a bare mount
    expect(arm('18-horse-gunner')).toBe('artillery')
    expect(arm('16-royal-horse-guards')).toBe('cavalry')
    expect(arm('22-krakus-pony')).toBe('mounts')
    expect(arm('19-krakus')).toBe('cavalry')
  })

  it('reads the slug without its number', () => {
    expect(armOfSlug('12-x', [['twelve', /^12/]], 'none')).toBe('none')
  })
})

describe('ids', () => {
  it("takes a person's id from the portrait file, in plain ASCII", () => {
    expect(personIdOf('french/jean_lannes-portrait-oil-v12.png')).toBe('jean_lannes')
    expect(personIdOf('prussian/gebhard_leberecht_von_blücher-portrait-oil-v7.png')).toBe(
      'gebhard_leberecht_von_blucher',
    )
    expect(personIdOf('polish/józef_poniatowski-portrait-oil-v7.png')).toBe('jozef_poniatowski')
  })

  it('drops accents and the Polish stroke, lower-cases, and replaces anything else', () => {
    expect(asciiId('Łukasz Kraśiński')).toBe('lukasz_krasinski')
    expect(asciiId('a.b c')).toBe('a_b_c')
  })

  it('decodes only the entities it knows', () => {
    expect(decodeEntities('A &amp; B &#39;C&#39; &quot;D&quot; &lt;e&gt; &nbsp;')).toBe('A & B \'C\' "D" <e> &nbsp;')
  })
})

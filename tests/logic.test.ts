import {describe,it,expect} from 'vitest';
import {applyTab,compareConcerts,genreGroup,priceLabel} from '../src/lib';
import {seedConcerts} from '../src/seed';
import {mediaFromRecords,safeImageUrl} from '../src/media';

describe('concert collection',()=>{
  it('loads the seeded snapshot',()=>expect(seedConcerts()).toHaveLength(22));
  it('filters rejected concerts only in discovery',()=>{
    const all=seedConcerts();const first=all[0];
    const rows=all.map(e=>({...e,preference:e.id===first.id?'not_interested' as const:e.preference}));
    expect(applyTab(rows,'discover',true).some(e=>e.id===first.id)).toBe(false);
    expect(applyTab(rows,'not_interested',true).some(e=>e.id===first.id)).toBe(true);
  });
  it('preserves wishlist for past shows',()=>{
    const rows=seedConcerts().map(e=>({...e,date:'2020-01-01',preference:'wishlisted' as const}));
    expect(applyTab(rows,'wishlist',true)).toHaveLength(22);
    expect(applyTab(rows,'wishlist',false)).toHaveLength(0);
  });
  it('sorts by date and then time',()=>{
    const [a,b]=seedConcerts();expect([b,a].sort(compareConcerts)[0].id).toBe(a.id);
  });
  it('groups classical and sufi',()=>{
    expect(genreGroup('Hindustani Classical')).toBe('Classical');
    expect(genreGroup('Indian Mystical','Kabir; Sufi')).toBe('Sufi & Mystical');
  });
  it('formats free and paid events',()=>{
    const a=seedConcerts()[0];expect(priceLabel(a)).toBe('Free / RSVP');
    expect(priceLabel({...a,priceMin:750,admissionType:'Paid'})).toBe('From ₹750');
  });
});

describe('source images',()=>{
  it('loads only source-verified URL images',()=>{
    const rows=[{Event_ID:'one',Image_URL:'https://cdn.example.com/a.jpg',Source_Page_URL:'https://example.com/show',Alt_Text:'Poster',Image_Type:'poster',Image_Order:'2'}, {Event_ID:'one',Image_URL:'https://cdn.example.com/b.jpg',Source_Page_URL:'https://example.com/show',Alt_Text:'Artist',Image_Type:'artist',Image_Order:'1'}];
    expect(mediaFromRecords(rows).one.map(x=>x.alt)).toEqual(['Artist','Poster']);
  });
  it('ignores unsafe or duplicated image URLs',()=>{
    expect(safeImageUrl('javascript:alert(1)')).toBe('');
    expect(safeImageUrl('http://example.com')).toBe('');
    const image={Event_ID:'one',Image_URL:'https://cdn.example.com/a.jpg',Source_Page_URL:'https://example.com/show'};
    expect(mediaFromRecords([image,image]).one).toHaveLength(1);
    expect(mediaFromRecords([{...image,Source_Page_URL:''}]).one).toBeUndefined();
  });
  it('keeps snapshot event images from the source table',()=>{
    expect(seedConcerts().filter(e=>e.images.length)).toHaveLength(2);
  });
});

import { describe, expect, it } from 'vitest';
import { componentHtml } from '../src/lib/directus';

describe('Directus nested component bindings', () => {
  it('binds feature-card title, link and accessible description into source markup', () => {
    const html = componentHtml('feature_grid', {
      source_html: '<a class="TPcta" href="/old" title="Old title"><svg></svg><h3>Old</h3></a>',
      items: [{ sort: 1, title: 'New & safe', description: 'New "title"', link_url: '/new' }],
    });
    expect(html).toContain('href="/new"');
    expect(html).toContain('title="New &quot;title&quot;"');
    expect(html).toContain('<h3>New &amp; safe</h3>');
  });

  it('binds testimonial heading and nested quote into source markup', () => {
    const html = componentHtml('testimonials', {
      source_html: '<h2>Old heading</h2><div data-aos="fade-down" data-aos-duration="800">Old quote </div>',
      heading: 'New heading',
      items: [{ sort: 1, quote: 'New quote' }],
    });
    expect(html).toContain('<h2>New heading</h2>');
    expect(html).toContain('>New quote</div>');
  });

  it('binds nested team name, bio and profile link while preserving the source layout', () => {
    const html = componentHtml('team_grid', {
      source_html: '<h2 class="H2">Meet Old Name</h2><br title="b11"/>Old bio<br title="b11"/><a class="TPbtn TPbtn-primary" href="/old">More</a>',
      members: [{ sort: 1, name: 'Dr. New & Name', bio: 'New <bio>', profile_url: '/new' }],
    });
    expect(html).toContain('Meet Dr. New &amp; Name');
    expect(html).toContain('New &lt;bio&gt;');
    expect(html).toContain('href="/new"');
    expect(html).toContain('>More</a>');
  });

  it('leaves already-synchronised source markup byte-for-byte unchanged', () => {
    const source = '<a class="TPcta" href="/same" title="Same"><h3>Same</h3></a>';
    expect(componentHtml('feature_grid', {
      source_html: source,
      items: [{ sort: 1, title: 'Same', description: 'Same', link_url: '/same' }],
    })).toBe(source);
  });
});

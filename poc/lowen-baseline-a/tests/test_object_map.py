#!/usr/bin/env python3
"""Focused regression fixtures for Dom's final Lowen migration findings."""

import importlib.util
import json
import unittest
from pathlib import Path

from bs4 import BeautifulSoup


MAPPER_PATH = Path(__file__).resolve().parents[1] / "scripts/object-map.py"
SPEC = importlib.util.spec_from_file_location("lowen_object_map", MAPPER_PATH)
mapper = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(mapper)

PAGE = {
    "title": "Fixture",
    "h1s": ["Fixture"],
    "sha256": "a" * 64,
    "templateFamily": "inner",
}
PAGE_URL = "https://www.lowenperio.com/p/fixture.asp"
STATS = {"dropped_srcless_img": 0, "dropped_unevidenced_img": 0}


def mapping(block_type, item):
    return mapper.mapped_block(block_type, item, PAGE, PAGE_URL, str(item), 0.99, ["fixture"])


class ObjectMapRegressionTests(unittest.TestCase):
    def test_source_header_social_and_contact_links_are_owned_by_theme(self):
        source = MAPPER_PATH.read_text()
        self.assertIn('"map_url": engine.normalize_url', source)
        self.assertIn('"instagram_url": engine.normalize_url', source)
        self.assertIn('"google_url": engine.normalize_url', source)

    def test_lowen_theme_preserves_source_palette_and_type_contract(self):
        site = json.loads((MAPPER_PATH.parents[1] / "migration/site.json").read_text())
        theme = site["theme"]
        self.assertEqual(theme["primary_color"], "#e36966")
        self.assertEqual(theme["secondary_color"], "#dae5f1")
        self.assertEqual(theme["accent_color"], "#282d77")
        self.assertEqual(theme["ink_color"], "#16324a")
        self.assertEqual(theme["heading_font"], "playfair")
        self.assertEqual(theme["body_font"], "jost")
        self.assertEqual(theme["heading_scale"], "source-faithful")
        self.assertEqual(theme["body_line_height"], "source-faithful")

    def test_inner_hero_consumes_opening_prose_without_promoting_bold_copy(self):
        soup = BeautifulSoup(
            '<td id="ArtID1"><span class="TPtitle"><h1>What is a Periodontist?</h1></span>'
            '<br/><br/>Opening paragraph one.<br/><br/>Opening paragraph two.'
            '<h2>Benefits</h2><br/><b>Periodontists Save Teeth!</b><br/>Body copy.</td>',
            "html.parser",
        )
        hero = mapper.extract_inner_hero(soup, PAGE, PAGE_URL, {}, {})
        self.assertIn("Opening paragraph one", hero["item"]["intro_paragraph"])
        self.assertNotIn("Opening paragraph two", hero["item"]["intro_paragraph"])
        self.assertIn("Opening paragraph two", str(soup.select_one("[id^='ArtID']")))
        self.assertIn("<br", hero["item"]["intro_paragraph"])
        remaining = str(soup.select_one("[id^='ArtID']"))
        self.assertIn("<b>Periodontists Save Teeth!</b>", remaining)
        self.assertNotIn("<h2>Periodontists Save Teeth!</h2>", remaining)

    def test_terminal_contextual_link_is_not_a_cta_without_control_evidence(self):
        soup = BeautifulSoup('<h2>Medical Correlation</h2><p>Research copy.</p><a href="https://example.com">Evidence</a>', "html.parser")
        blocks, _ = mapper.block_from_segment(list(soup.contents), PAGE, PAGE_URL, {}, {}, dict(STATS), False, "#fff")
        self.assertNotIn("cta_candidate", blocks[0]["mapping"])
        self.assertEqual(mapper.promote_terminal_cta(blocks)[0]["type"], "flex_content_section")

    def test_explicit_button_can_be_promoted_when_terminal(self):
        soup = BeautifulSoup('<h2>Book a consultation</h2><p>Choose a time.</p><a class="TPbtn" href="/contact">Book now</a>', "html.parser")
        blocks, _ = mapper.block_from_segment(list(soup.contents), PAGE, PAGE_URL, {}, {}, dict(STATS), False, "#fff")
        self.assertIn("cta_candidate", blocks[0]["mapping"])
        self.assertEqual(mapper.promote_terminal_cta(blocks)[0]["type"], "cta_section_standard")

    def test_highlight_heading_is_folded_into_the_links_component(self):
        heading = mapping("flex_content_section", {"section_header": "Learn More", "body_content": "<p></p>"})
        links = mapping("highlight_links", {"section_heading": "", "links": [{"link_label": "Service", "link_url": "/service/", "sort": 1}]})
        folded = mapper.fold_adjacent_component_headings([heading, links])
        self.assertEqual(len(folded), 1)
        self.assertEqual(folded[0]["item"]["section_heading"], "Learn More")

    def test_contact_page_uses_contact_component_and_preserves_fax(self):
        hero = mapping("inner_hero_standard", {"page_title": "Office Information", "intro_paragraph": "Welcome"})
        location = mapping("flex_content_section", {"section_header": "Location:", "body_content": "9900 SW Greenburg Road<br/>Tigard, OR 97223"})
        contact = mapping("flex_content_section", {"section_header": "Contact Information:", "body_content": 'Phone: 503 620 1117<br/>Fax: 503 624 1547<br/>Email: <a href="mailto:info@lowenperio.com">info@lowenperio.com</a>'})
        hours = mapping("flex_content_section", {"section_header": "Office Hours:", "body_content": "Mon: 7am-4pm"})
        result = mapper.compose_contact_info([hero, location, contact, hours], "contact-us", PAGE, PAGE_URL)
        self.assertEqual([block["type"] for block in result], ["inner_hero_standard", "contact_info_standard", "flex_content_section", "flex_content_section"])
        self.assertEqual(result[1]["item"]["phone"], "503 620 1117")
        self.assertEqual(result[1]["item"]["email"], "info@lowenperio.com")
        self.assertEqual(result[2]["item"]["section_header"], "Fax")

    def test_utility_mode_emits_only_flex_content_after_one_hero(self):
        soup = BeautifulSoup('<h2>Learn More</h2><div class="TPlist-group"><a class="TPlist-group-item" href="/one">One</a></div>', "html.parser")
        blocks, _ = mapper.block_from_segment(list(soup.contents), PAGE, PAGE_URL, {}, {}, dict(STATS), False, "#fff", mode="utility")
        hero = mapping("inner_hero_standard", {"page_title": "Fixture", "intro_paragraph": "Intro"})
        mapper.assert_page_block_invariants([hero, *blocks], "inner", "fixture", "utility")
        self.assertEqual([block["type"] for block in blocks], ["flex_content_section"])
        self.assertIn('<a href="/one">One</a>', blocks[0]["item"]["body_content"])
        self.assertNotIn("TPlist", blocks[0]["item"]["body_content"])

    def test_exactly_one_leading_inner_hero_is_enforced(self):
        hero = mapping("inner_hero_standard", {"page_title": "Fixture", "intro_paragraph": "Intro"})
        mapper.assert_page_block_invariants([hero], "inner", "fixture", "presentation")
        with self.assertRaisesRegex(RuntimeError, "exactly one leading Inner Hero"):
            mapper.assert_page_block_invariants([hero, hero], "inner", "fixture", "presentation")


if __name__ == "__main__":
    unittest.main()

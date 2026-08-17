import type {PearlBlock} from './types';

export const pearlFixture: PearlBlock[] = [
  {type:'main_hero_standard',item:{heading:'Pearl Dentistry',supporting_text:'Your Beaverton, OR Dentist',background_image:'/assets/bd9b8d625009_www.jeffreycarldmd.com_tpn_c_C180_img_BKG-anibanner-c180.webp'}},
  {type:'icon_feature_cards',item:{display_variant:'overlay',items:[
    {icon:'/pearl/pearl-icon-preventative.svg',title:'Preventative Dentistry',url:'#services',sort:1},
    {icon:'/pearl/pearl-icon-implant.svg',title:'Dental Implants',url:'#services',sort:2},
    {icon:'/pearl/pearl-icon-invisalign.svg',title:'Invisalign',url:'#services',sort:3},
    {icon:'/pearl/pearl-icon-emergency.svg',title:'Emergency Dentistry',url:'#services',sort:4},
  ]}},
  {type:'feature_image_content',item:{heading:'Welcome to Pearl Dentistry',body:'<p>Healthy smiles for healthy families start with professional family dentistry.</p>',image:'/pearl/pearl-welcome-doctor.webp',image_alt:'Dentist welcoming a patient',image_position:'left',cta_label:'Learn more about us',cta_url:'#about'}},
  {type:'icon_feature_cards',item:{section_heading:'Our Services',background_image:'/pearl/pearl-services-background.jpg',display_variant:'services',items:[
    {icon:'/pearl/pearl-icon-preventative.svg',title:'Preventative Dentistry',url:'#',sort:1},
    {icon:'/pearl/pearl-icon-implant.svg',title:'Dental Implants',url:'#',sort:2},
    {icon:'/pearl/pearl-icon-invisalign.svg',title:'Invisalign',url:'#',sort:3},
    {icon:'/pearl/pearl-icon-emergency.svg',title:'Emergency Dentistry',url:'#',sort:4},
  ]}},
  {type:'highlight_snippet_quote',item:{quote:'<p>This is hands down the best dental office I have ever been to.</p>',tone:'brand',facebook_url:'#',x_url:'#'}},
  {type:'feature_image_content',item:{heading:'Meet the Doctor',subheading:'Dr. Amanda Pearl',body:'<p>Dr. Amanda Pearl is dedicated to providing exceptional dental care.</p>',image:'/pearl/pearl-doctor-amanda.jpg',image_alt:'Dr. Amanda Pearl',image_position:'right',cta_label:'More about Dr. Amanda Pearl',cta_url:'#about'}},
  {type:'contact_info_standard',item:{heading:'Visit Pearl Dentistry',address:'8625 SW Cascade Avenue, Suite 300 Beaverton, OR',phone:'(888) 246-6909',map_url:'https://maps.google.com/'}},
  {type:'cta_section_standard',item:{heading:'A healthier smile starts here',body:'<p>Friendly, professional dental care for the whole family.</p>',background_image:'/assets/a8657eecc5fc_www.jeffreycarldmd.com_tpn_c_C180_img_Dr-Jeff-Carl-office-front-01.jpg',cta_label:'Request an appointment',cta_url:'#contact'}},
];

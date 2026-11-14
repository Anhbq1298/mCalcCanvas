// Editable native line / rect / text diagrams; no raster or image-region extension.
export function compositeFigures(l) {
  return (code, caption, mode) => {
    l.need(7);
    l.KEEP(() => {
      l.H(3, `${code} — ${caption}`);
      const y0 = l.ln(l.st.page, l.st.row);
      const add = (type, x, y, props) => l.out.push({ id:l.id(), type, x:76+x, y:y0+y, props });
      const line = (x,y,x2,y2,arrow=false) => add('line',x,y,{x2:x2-x,y2:y2-y,stroke:'#111111',strokeWidth:1.2,arrow});
      const rect = (x,y,w,h) => add('rect',x,y,{w,h,stroke:'#111111',strokeWidth:1.2});
      const text = (x,y,t,w=t.length>35?630-x:220) => add('text',x,y,{w:Math.min(w,630-x),h:20,html:t,fontFamily:'Roboto',fontSize:12,color:'#111111',align:'left'});
      const dim = (x,y,x2,y2,t) => {
        line(x,y,x2,y2); line(x-3,y-4,x+3,y+4);line(x2-3,y2-4,x2+3,y2+4);
        text((x+x2)/2+(t.startsWith('ha =')?-110:5),(y+y2)/2+3,t,170);
      };
      const steel = (x,y) => { rect(x,y,110,10);rect(x+51,y+10,8,120);rect(x,y+130,110,10); };
      const slab = (x,y) => rect(x-55,y-50,220,50);
      const beam = () => {
        line(30,90,550,90); line(30,90,20,110);line(30,90,40,110);line(20,110,40,110);
        line(550,90,540,110);line(550,90,560,110);line(540,110,560,110);
        for(let x=40;x<550;x+=40)line(x,25,x,85,true);
        text(170,0,'w = load for the selected stage');
        line(30,150,30,115,true);line(550,150,550,115,true);
        text(0,155,'RA = wL/2');text(465,155,'RB = wL/2');dim(30,195,550,195,'L = 8000 mm');
      };
      if(mode==='beam') beam();
      else if(mode==='section'||mode==='construction') {
        steel(210,75);
        if(mode==='section'){slab(210,75);dim(385,25,385,75,'hc = 150 mm');text(395,5,'RC slab above steel');}
        else {text(10,15,'Wet concrete: vertical load only');line(265,25,265,70,true);text(395,70,'No restraint credit');}
        dim(190,75,190,215,'ha = 406.4 mm');dim(210,240,320,240,'ba = 177.9 mm');
        text(395,135,'tf = 12.8 mm');text(395,160,'tw = 7.9 mm');text(395,185,'Fillets r = 10.2 mm');
      } else if(mode==='width') {
        rect(30,70,540,45);for(const x of [30,300,570]){line(x,40,x,170);text(x-25,175,'beam',70);}
        line(210,55,390,55);dim(210,20,390,20,'beff = 2000 mm');dim(30,215,300,215,'spacing = 3000 mm');
        text(100,120,'be1 = 1000');text(330,120,'be2 = 1000');text(410,20,'b0 = 0');
      } else if(mode==='studs') {
        rect(35,65,530,65);line(300,30,300,170);text(275,5,'L/2');
        for(let x=45;x<565;x+=22){line(x,77,x,117);line(x-4,77,x+4,77);}
        dim(45,160,67,160,'s = 166.7 mm (symbolic scale)');text(25,205,'Single row on flange centreline; first centre 83.3 mm from end.');
        text(25,230,'Stud d = 19 mm; hsc = 100 mm; 50 mm cover above head.');
      } else if(mode==='shear') {
        rect(30,30,520,110);rect(250,30,70,110);
        for(const x of [235,335]){line(x,0,x,180);text(x-5,185,'plane',80);}
        for(const y of [55,85,115])line(75,y,510,y);
        line(185,90,100,90,true);line(390,90,480,90,true);
        text(20,220,'H10-150 bars cross each vertical shear plane and require anchorage.');
        text(20,245,'Each outstand receives half of the longitudinal transfer.');
      } else if(mode==='deflection') {
        line(30,30,550,30);let px=30,py=30;
        for(let i=1;i<=20;i++){const x=30+26*i,y=30+65*4*(i/20)*(1-i/20);line(px,py,x,y);px=x;py=y;}
        px=30;py=30;for(let i=1;i<=20;i++){const x=30+26*i,y=30+130*4*(i/20)*(1-i/20);line(px,py,x,y);px=x;py=y;}
        text(150,0,'Original chord');text(150,100,'Steel-only locked-in sag');text(150,175,'+ composite creep, imposed load and shrinkage');
        text(30,225,'Schematic, magnified. No automatic camber compensation.');
      } else {
        steel(70,90);slab(70,90);
        const z=mode==='slab'?65:mode==='flange'?96:mode==='web'?140:222;
        line(0,z,530,z);text(415,z+5,mode==='slab'?'slab PNA':'steel PNA');
        rect(275,40,45,mode==='slab'?25:30);line(320,52,380,52,true);text(385,35,'Cc at xc/2');
        const comp=mode==='slab'?0:Math.max(5,z-90);
        if(comp){rect(275,90,35,comp);line(310,90+comp/2,365,90+comp/2,true);text(370,85+comp/2,'Ca');}
        rect(235,90+comp,40,140-comp);line(235,90+comp+(140-comp)/2,195,90+comp+(140-comp)/2,true);
        text(310,215,'Ta: steel tension');text(0,250,'Section (left) | stress blocks and resultants (right); schematic scale.');
        if(mode!=='slab'){line(0,65,220,65);text(0,15,'Separate slab compression depth xc');}
        if(mode==='rejected')text(260,160,'REJECT: Aac &gt; Aa/2',260);
      }
      l.gap(7);
    });
  };
}

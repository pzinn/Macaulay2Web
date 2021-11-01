-- Welcome to Macaulay2 !
-- In this window you may type in Macaulay2 commands
-- and have them evaluated by the server.

-- Evaluate a line or selection by typing Shift+Enter
-- or by clicking on Evaluate.

-- What follows is a set of examples.

-- You can erase it all by e.g. pressing the trash button at the bottom right
-- (if you do so, provide another file name in the bottom right box
-- so your editor content is autosaved on the server)

-- To open the Macaulay2 documentation for a
-- topic in the "Browse" tab:
viewHelp "determinant"

-- Here are some sample commands:
R = ZZ/101[a,b,c,d]
I = ideal(a^2-b*c, a^3-b^3, a^4-b*d^3, a^5-c^2*d^3)
grb = first entries groebnerBasis I;
VerticalList grb -- for emulation of ascii style, try netList grb instead
I == ideal grb

-- Some examples of rings
A = ZZ/32003[a..g]
B = QQ[x_1..x_6]
C = (GF 32)[α,β,γ]

-- something fun
needsPackage "VectorGraphics"
V={vector{-137.638,0.,26.2866},vector{137.638,0.,-26.2866},vector{-42.5325,-130.902,26.2866},vector{-42.5325,130.902,26.2866},vector{111.352,-80.9017,26.2866},vector{111.352,80.9017,26.2866},vector{-26.2866,-80.9017,111.352},vector{-26.2866,80.9017,111.352},vector{-68.8191,-50.,-111.352},vector{-68.8191,50.,-111.352},vector{68.8191,-50.,111.352},vector{68.8191,50.,111.352},vector{85.0651,0.,-111.352},vector{-111.352,-80.9017,-26.2866},vector{-111.352,80.9017,-26.2866},vector{-85.0651,0.,111.352},vector{26.2866,-80.9017,-111.352},vector{26.2866,80.9017,-111.352},vector{42.5325,-130.902,-26.2866},vector{42.5325,130.902,-26.2866}};
F={{14,9,8,13,0},{1,5,11,10,4},{4,10,6,2,18},{10,11,7,15,6},{11,5,19,3,7},{5,1,12,17,19},{1,4,18,16,12},{3,19,17,9,14},{17,12,16,8,9},{16,18,2,13,8},{2,6,15,0,13},{15,7,3,14,0}};
C=apply(F,f->1/5*sum(f,i->V#i));
steps=30;
dodecasplit=apply(F,C,(f,c)->Polygon{apply(f,j->V#j),
        AnimMatrix=>apply(steps,j->rotation(2*pi/5/steps*4*min(j/steps,1-j/steps),c,c)*translation(0.075*sin(2*pi*j/steps)*c)),
        "fill"=>concatenate("rgb(",toString(134+round(1.2*c_0)),",",toString(134+round(1.2*c_1)),",",toString(134+round(1.2*c_2)),")")});
d=gList(dodecasplit,"fill-opacity"=>0.7,AnimMatrix=>rotation(0.02,[1,2,3]),Draggable=>true);
d1=d ++ {TransformMatrix=>translation[200,0,0]};
d2=d ++ {TransformMatrix=>translation[-200,0,0]};
gList(d1,d2,ViewPort=>{vector{-400,-400},vector{400,400}},Size=>40,"stroke-width"=>2) -- press button at top/left!

-- or (more serious)
R=RR[x,y]; P=y^2-(x+1)*(x-1)*(x-2);
plot(P,{-2,3},"stroke-width"=>0.05,Size=>35,"stroke"=>"red")

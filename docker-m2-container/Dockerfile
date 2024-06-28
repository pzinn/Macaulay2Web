# fedora + Macaulay2
FROM registry.fedoraproject.org/fedora-minimal:35
MAINTAINER Paul Zinn-Justin <pzinn@unimelb.edu.au>
RUN microdnf -y install sudo wget tar openssh openssl openssh-server graphviz lapack cddlib gc glpk gmp-c++ openblas-serial openblas-threads libnauty libatomic_ops givaro mathic mathicgb-libs memtailor boost-stacktrace boost-regex procps mpfr normaliz gfan which factory flint flexiblas-netlib ntl mpfi libffi nauty csdp csdp-tools && microdnf clean all
# have to manually do this cause no systemd
RUN ssh-keygen -t rsa -f /etc/ssh/ssh_host_rsa_key -N ''
RUN ssh-keygen -t dsa -f /etc/ssh/ssh_host_dsa_key -N ''

# Macaulay2
COPY Macaulay2-*.rpm ./
RUN rpm -i Macaulay2-*.rpm
RUN rm Macaulay2-*.rpm

# M2 userland, part 1.    
RUN useradd -m -d /home/m2user m2user
RUN mkdir /custom
RUN chown -R m2user:m2user /custom
RUN chmod -R 775 /custom

# PHCpack
ENV PHC_VERSION 24
#RUN (cd /custom; wget https://github.com/janverschelde/PHCpack/files/13774149/x86_64phcv${PHC_VERSION}p.tar.gz)
#RUN (cd /custom; tar zxf x86_64phcv${PHC_VERSION}p.tar.gz; mv phc /usr/bin; rm x86_64phcv${PHC_VERSION}p.tar.gz)

# Bertini
# This is the only way extracting Bertini gives the right permissions.
ENV BERTINI_VERSION 1.6
RUN su m2user -c "/bin/bash;\
   cd /custom;\
   wget https://bertini.nd.edu/BertiniLinux64_v${BERTINI_VERSION}.tar.gz;\
   tar xzf BertiniLinux64_v${BERTINI_VERSION}.tar.gz;"
RUN ln -s /custom/BertiniLinux64_v${BERTINI_VERSION}/bertini /usr/bin/

# surf binary
COPY surf /usr/bin

# tag stderr
COPY libtagstderr.so /usr/lib64

# new: let user modify M2 code
RUN chown -R m2user:m2user /usr/share/Macaulay2
